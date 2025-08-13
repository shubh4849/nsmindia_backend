const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {fileService, progressService} = require('../services');
const uuid = require('uuid');
const {fileTypes, ALL_ALLOWED_FILE_TYPES} = require('../constants');
const {getPaginateConfig} = require('../utils/queryPHandler');
const Busboy = require('busboy');
const {fileUploadService} = require('../microservices');
const sqs = require('../utils/sqs');
const config = require('../config/config');

const initUpload = catchAsync(async (req, res) => {
  const uploadId = uuid.v4();
  const {fileName, fileSize, folderId} = req.body || {};
  await progressService.initUploadProgress(uploadId, {
    fileName,
    fileSize: typeof fileSize === 'string' ? Number(fileSize) : fileSize,
  });
  res.status(httpStatus.CREATED).send({status: true, uploadId, folderId});
});

const uploadFile = catchAsync(async (req, res) => {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Content-Type must be multipart/form-data');
  }

  const busboy = Busboy({headers: req.headers});

  let uploadId = req.headers['x-upload-id'] || req.query.uploadId || null;
  let folderId = req.query.folderId || null;
  let fileName = null;
  let mimeType = null;
  let totalBytes = null;
  let uploadedBytes = 0;
  let finished = false;

  const headerSize = Number(req.headers['x-file-size']);
  if (!Number.isNaN(headerSize)) totalBytes = headerSize;
  const contentLength = Number(req.headers['content-length']);
  if (!Number.isNaN(contentLength)) {
    totalBytes = totalBytes || contentLength;
  }

  const throttledUpdate = progressService.throttle((bytes, size, meta) => {
    if (!uploadId) return;
    // Persist to DB
    progressService.updateUploadProgress(uploadId, bytes, size || 0, meta).catch(() => {});
    // Publish to SQS
    sqs
      .publish(config.aws.sqs.progressEventsUrl, {
        event: 'UPLOAD_PROGRESS',
        uploadId,
        progress: size > 0 ? (bytes / size) * 100 : 0,
        uploadedBytes: bytes,
        fileSize: size || 0,
        status: 'uploading',
        fileName: meta?.fileName,
        at: Date.now(),
      })
      .catch(() => {});
  }, 200);

  busboy.on('field', (name, val) => {
    if (name === 'uploadId') uploadId = uploadId || val;
    if (name === 'folderId') folderId = val;
    if (name === 'fileName') fileName = val;
    if (name === 'fileSize') {
      const n = Number(val);
      if (!Number.isNaN(n)) totalBytes = n;
    }
  });

  busboy.on('file', (name, file, info) => {
    const {filename, mimeType: mm} = info;
    fileName = fileName || filename;
    mimeType = mm;

    if (!uploadId) {
      file.resume();
      busboy.emit('error', new ApiError(httpStatus.BAD_REQUEST, 'Missing uploadId'));
      return;
    }

    if (!fileTypes.includes(mimeType)) {
      file.resume();
      busboy.emit(
        'error',
        new ApiError(
          httpStatus.UNSUPPORTED_MEDIA_TYPE,
          `File type ${mimeType} is not supported. Allowed types: ${ALL_ALLOWED_FILE_TYPES.join(', ')}`
        )
      );
      return;
    }

    const ensureInit = async () => {
      await progressService.initUploadProgress(uploadId, {fileName, fileSize: totalBytes});
    };

    ensureInit().then(() => {
      const folderPath = `files/${folderId || 'root'}`;
      const base = fileUploadService.sanitizeBaseName(fileName || filename);

      file.on('data', chunk => {
        uploadedBytes += chunk.length;
        throttledUpdate(uploadedBytes, totalBytes, {fileName, status: 'uploading'});
      });

      file.on('limit', () => {
        progressService
          .failUploadProgress(uploadId, {fileName})
          .catch(() => {})
          .finally(() => {
            // Publish failure
            sqs
              .publish(config.aws.sqs.progressEventsUrl, {
                event: 'UPLOAD_FAILED',
                uploadId,
                fileName,
                at: Date.now(),
              })
              .catch(() => {});

            req.unpipe(busboy);
            try {
              busboy.removeAllListeners();
            } catch {}
            res.status(httpStatus.BAD_REQUEST).send({status: false, message: 'File too large'});
          });
      });

      fileUploadService
        .uploadStreamToStorage({
          stream: file,
          folder: folderPath,
          publicId: `${uuid.v4()}-${base}`,
          resourceType: 'raw',
          mimeType,
        })
        .then(async uploadResult => {
          finished = true;
          await progressService.updateUploadProgress(uploadId, uploadedBytes, totalBytes || uploadedBytes, {
            fileName,
            status: 'completed',
          });
          // Publish completion
          sqs
            .publish(config.aws.sqs.progressEventsUrl, {
              event: 'UPLOAD_COMPLETED',
              uploadId,
              uploadedBytes,
              fileSize: totalBytes || uploadedBytes,
              status: 'completed',
              fileName,
              at: Date.now(),
            })
            .catch(() => {});

          try {
            console.log('[UploadProgress] final write', {
              uploadId,
              uploadedBytes,
              totalBytes: totalBytes || uploadedBytes,
              status: 'completed',
            });
          } catch {}

          const created = await fileService.createFileRecordFromUploadResult({
            uploadResult,
            originalName: fileName,
            mimeType,
            fileSize: totalBytes || uploadedBytes,
            folderId,
          });

          res.status(httpStatus.CREATED).send({status: true, uploadId, file: created});
        })
        .catch(async err => {
          await progressService.failUploadProgress(uploadId, {fileName}).catch(() => {});
          // Publish failure
          sqs
            .publish(config.aws.sqs.progressEventsUrl, {
              event: 'UPLOAD_FAILED',
              uploadId,
              fileName,
              at: Date.now(),
            })
            .catch(() => {});

          res.status(httpStatus.INTERNAL_SERVER_ERROR).send({status: false, message: err.message || 'Upload failed'});
        });
    });
  });

  busboy.on('error', async err => {
    if (uploadId) await progressService.failUploadProgress(uploadId, {fileName}).catch(() => {});
    // Publish failure
    if (uploadId) {
      sqs
        .publish(config.aws.sqs.progressEventsUrl, {
          event: 'UPLOAD_FAILED',
          uploadId,
          fileName,
          at: Date.now(),
        })
        .catch(() => {});
    }
    res.status(err.statusCode || httpStatus.BAD_REQUEST).send({status: false, message: err.message || 'Upload error'});
  });

  req.on('aborted', () => {
    if (uploadId) progressService.failUploadProgress(uploadId, {fileName}).catch(() => {});
    if (uploadId) {
      sqs
        .publish(config.aws.sqs.progressEventsUrl, {
          event: 'UPLOAD_FAILED',
          uploadId,
          fileName,
          at: Date.now(),
        })
        .catch(() => {});
    }
  });

  req.pipe(busboy);
});

const getFiles = catchAsync(async (req, res) => {
  const {filters, options} = getPaginateConfig(req.query);
  const result = await fileService.queryFiles(filters, options);
  res.send({status: true, ...result});
});

const getFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  const data = file.toObject ? file.toObject() : file;
  res.send({status: true, ...data});
});

const downloadFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  res.redirect(file.filePath);
});

const previewFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  res.redirect(file.filePath);
});

const updateFile = catchAsync(async (req, res) => {
  const file = await fileService.updateFileById(req.params.fileId, req.body);
  const data = file.toObject ? file.toObject() : file;
  res.send({status: true, ...data});
});

const deleteFile = catchAsync(async (req, res) => {
  await fileService.deleteFileById(req.params.fileId);
  res.status(httpStatus.OK).send({status: true});
});

const searchFiles = catchAsync(async (req, res) => {
  const {q, ...otherQuery} = req.query;
  const {filters, options} = getPaginateConfig(otherQuery);

  const result = await fileService.getFilteredFiles(
    {
      q,
      ...filters,
    },
    options
  );

  res.json({status: true, ...result});
});

const getTotalFiles = catchAsync(async (req, res) => {
  const count = await fileService.getTotalFilesCount();
  res.status(httpStatus.OK).send({status: true, count});
});

module.exports = {
  initUpload,
  uploadFile,
  getFiles,
  getFile,
  downloadFile,
  previewFile,
  updateFile,
  deleteFile,
  searchFiles,
  getTotalFiles,
};
