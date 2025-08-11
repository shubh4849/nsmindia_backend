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
const {mapResourceType, resolveExtension} = require('../utils/storage');

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
    progressService.updateUploadProgress(uploadId, bytes, size || 0, meta).catch(() => {});
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
            req.unpipe(busboy);
            try {
              busboy.removeAllListeners();
            } catch {}
            res.status(httpStatus.BAD_REQUEST).send({status: false, message: 'File too large'});
          });
      });

      const resourceType = mapResourceType(mimeType);
      const ext = resolveExtension({format: undefined, mimeType, originalName: fileName});
      const idBase = `${uuid.v4()}-${base}`;
      const publicId = ext ? `${idBase}.${ext}` : idBase;

      fileUploadService
        .uploadStreamToStorage({
          stream: file,
          folder: folderPath,
          publicId,
          resourceType,
          mimeType,
        })
        .then(async uploadResult => {
          finished = true;
          await progressService.updateUploadProgress(uploadId, uploadedBytes, totalBytes || uploadedBytes, {
            fileName,
            status: 'completed',
          });
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

          const createdObj = created.toObject ? created.toObject() : created;
          const fileWithUrl = {...createdObj, url: createdObj.publicViewUrl || createdObj.filePath};

          res.status(httpStatus.CREATED).send({status: true, uploadId, file: fileWithUrl});
        })
        .catch(async err => {
          await progressService.failUploadProgress(uploadId, {fileName}).catch(() => {});
          res.status(httpStatus.INTERNAL_SERVER_ERROR).send({status: false, message: err.message || 'Upload failed'});
        });
    });
  });

  busboy.on('error', async err => {
    if (uploadId) await progressService.failUploadProgress(uploadId, {fileName}).catch(() => {});
    res.status(err.statusCode || httpStatus.BAD_REQUEST).send({status: false, message: err.message || 'Upload error'});
  });

  req.on('aborted', () => {
    if (uploadId) progressService.failUploadProgress(uploadId, {fileName}).catch(() => {});
  });

  req.pipe(busboy);
});

const getFiles = catchAsync(async (req, res) => {
  const {filters, options} = getPaginateConfig(req.query);
  const result = await fileService.queryFiles(filters, options);
  const resultsWithUrl = (result.results || []).map(f => ({...f, url: f.publicViewUrl || f.filePath}));
  res.send({status: true, ...result, results: resultsWithUrl});
});

const getFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  const data = file.toObject ? file.toObject() : file;
  const dataWithUrl = {...data, url: data.publicViewUrl || data.filePath};
  res.send({status: true, ...dataWithUrl});
});

const downloadFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  res.redirect(file.publicViewUrl || file.filePath);
});

const previewFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  res.redirect(file.publicViewUrl || file.filePath);
});

const updateFile = catchAsync(async (req, res) => {
  const file = await fileService.updateFileById(req.params.fileId, req.body);
  const data = file.toObject ? file.toObject() : file;
  const dataWithUrl = {...data, url: data.publicViewUrl || data.filePath};
  res.send({status: true, ...dataWithUrl});
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

  const resultsWithUrl = (result.results || []).map(f => ({...f, url: f.publicViewUrl || f.filePath}));

  res.json({status: true, ...result, results: resultsWithUrl});
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
