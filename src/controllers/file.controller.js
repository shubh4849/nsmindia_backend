const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {fileService, progressService} = require('../services');
const uuid = require('uuid');
const {fileTypes, ALL_ALLOWED_FILE_TYPES} = require('../constants');

const uploadFile = catchAsync(async (req, res) => {
  const uploadId = uuid.v4();
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
  }
  if (!fileTypes.includes(req.file.mimetype)) {
    throw new ApiError(
      httpStatus.UNSUPPORTED_MEDIA_TYPE,
      `File type ${req.file.mimetype} is not supported. Allowed types: ${ALL_ALLOWED_FILE_TYPES.join(', ')}`
    );
  }
  const file = await fileService.createFile({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    folderId: req.body.folderId,
  });

  // Create upload progress entry
  await progressService.updateUploadProgress(uploadId, req.file.size, req.file.size);

  res.status(httpStatus.CREATED).send({uploadId, fileId: file._id});
});

const getFiles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'description', 'folderId', 'mimeType', 'dateFrom', 'dateTo']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await fileService.queryFiles(filter, options);
  res.send(result);
});

const getFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  res.send(file);
});

const downloadFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  res.redirect(file.filePath); // Redirect to Cloudinary URL for download
});

const previewFile = catchAsync(async (req, res) => {
  const file = await fileService.getFileById(req.params.fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  res.redirect(file.filePath); // Redirect to Cloudinary URL for preview
});

const updateFile = catchAsync(async (req, res) => {
  const file = await fileService.updateFileById(req.params.fileId, req.body);
  res.send(file);
});

const deleteFile = catchAsync(async (req, res) => {
  await fileService.deleteFileById(req.params.fileId);
  res.status(httpStatus.NO_CONTENT).send();
});

const searchFiles = catchAsync(async (req, res) => {
  const {q, folderId, type, dateFrom, dateTo, name, description, page = 1, limit = 10} = req.query;

  const {files, totalFiles} = await fileService.getFilteredFiles(
    {
      q,
      folderId,
      type,
      dateFrom,
      dateTo,
      name,
      description,
    },
    {page, limit}
  );

  res.json({
    files,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalFiles,
      pages: Math.ceil(totalFiles / limit),
    },
  });
});

const getTotalFiles = catchAsync(async (req, res) => {
  const count = await fileService.getTotalFilesCount();
  res.status(httpStatus.OK).send({count});
});

module.exports = {
  uploadFile,
  getFiles,
  getFile,
  downloadFile,
  previewFile,
  updateFile,
  deleteFile,
  searchFiles,
};

module.exports.getTotalFiles = getTotalFiles;
