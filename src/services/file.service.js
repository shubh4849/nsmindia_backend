const httpStatus = require('http-status');
const {File} = require('../models');
const ApiError = require('../utils/ApiError');
const {fileUploadService} = require('../microservices');
const {v4: uuidv4} = require('uuid');
const {mapResourceType, resolveExtension, buildPublicUrlFromBase} = require('../utils/storage');
const config = require('../config/config');
const sqs = require('../utils/sqs');
const {fileEventSchema} = require('../events/schemas');

const publishFileEvent = async payload => {
  const {error} = fileEventSchema.validate(payload);
  if (error) return; // skip malformed
  await sqs.publish(config.aws.sqs.fileEventsUrl, payload);
};

const createFile = async ({buffer, originalName, mimeType, fileSize, folderId}) => {
  const folderPath = `files/${folderId || 'root'}`;
  const base = fileUploadService.sanitizeBaseName(originalName);
  const uniqueBase = `${uuidv4()}-${base}`;

  const resourceType = mapResourceType(mimeType);
  const uploadResult = await fileUploadService.uploadFileToStorage({
    fileBuffer: buffer,
    folder: folderPath,
    publicId: uniqueBase,
    resourceType,
    mimeType,
  });

  const fileBody = {
    name: base || originalName,
    originalName,
    filePath: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    key: uploadResult.public_id,
    resourceType: uploadResult.resource_type,
    format: resolveExtension({format: uploadResult.format, mimeType, originalName}),
    deliveryType: uploadResult.type,
    fileSize,
    mimeType,
    folderId,
  };
  const created = await File.create(fileBody);
  publishFileEvent({
    event: 'FILE_CREATED',
    fileId: created._id,
    folderId: created.folderId || null,
    name: created.originalName || created.name,
    mimeType: created.mimeType,
    fileSize: created.fileSize,
    at: Date.now(),
  }).catch(() => {});
  return created;
};

const createFileRecordFromUploadResult = async ({uploadResult, originalName, mimeType, fileSize, folderId}) => {
  const base = fileUploadService.sanitizeBaseName(originalName || 'file');
  const fileBody = {
    name: base || originalName,
    originalName: originalName || base,
    filePath: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    key: uploadResult.public_id,
    resourceType: uploadResult.resource_type,
    format: resolveExtension({format: uploadResult.format, mimeType, originalName}),
    deliveryType: uploadResult.type,
    fileSize,
    mimeType: mimeType,
    folderId,
  };
  const created = await File.create(fileBody);
  publishFileEvent({
    event: 'FILE_CREATED',
    fileId: created._id,
    folderId: created.folderId || null,
    name: created.originalName || created.name,
    mimeType: created.mimeType,
    fileSize: created.fileSize,
    at: Date.now(),
  }).catch(() => {});
  return created;
};

const queryFiles = async (filters, options) => {
  const mongoFilters = {};
  if (filters.name) mongoFilters.name = new RegExp(filters.name, 'i');
  if (filters.description) mongoFilters.description = new RegExp(filters.description, 'i');
  if (filters.folderId) mongoFilters.folderId = filters.folderId;
  if (filters.mimeType) mongoFilters.mimeType = new RegExp(filters.mimeType, 'i');
  if (filters.dateFrom || filters.dateTo) {
    mongoFilters.createdAt = {};
    if (filters.dateFrom) mongoFilters.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) mongoFilters.createdAt.$lte = new Date(filters.dateTo);
  }
  return File.paginate(mongoFilters, options || {});
};

const getFileById = async id => File.findById(id);

const updateFileById = async (fileId, updateBody) => {
  const file = await getFileById(fileId);
  if (!file) throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  Object.assign(file, updateBody);
  await file.save();
  return file;
};

const deleteFileById = async fileId => {
  const file = await getFileById(fileId);
  if (!file) throw new ApiError(httpStatus.NOT_FOUND, 'File not found');

  try {
    if (file.key) {
      await fileUploadService.deleteFileFromStorage(file.key);
    }
  } catch (err) {
    console.error('[DeleteFile] Storage delete error', err);
  }

  try {
    await file.deleteOne();
    console.log('[DeleteFile] Mongo document deleted', {fileId});
  } catch (err) {
    console.error('[DeleteFile] Mongo delete error', err);
    throw err;
  }

  publishFileEvent({
    event: 'FILE_DELETED',
    fileId: fileId,
    folderId: file.folderId || null,
    at: Date.now(),
  }).catch(() => {});

  // Note: deleteFolderIfEmpty is a no-op for R2
  return file;
};

const getFilesByFolderId = async (folderId, filterParams = {}, options = {}) => {
  return getFilteredFiles({...filterParams, folderId}, options);
};

const getFilteredFiles = async (filter, options) => {
  let query = {};
  if (filter.folderId === null) {
    query.folderId = null;
  } else if (filter.folderId) {
    query.folderId = filter.folderId;
  }

  if (filter.name) query.originalName = new RegExp(filter.name, 'i');

  if (filter.dateFrom || filter.dateTo) {
    query.createdAt = {};
    if (filter.dateFrom) query.createdAt.$gte = new Date(filter.dateFrom);
    if (filter.dateTo) query.createdAt.$lte = new Date(filter.dateTo);
  }
  return File.paginate(query, options || {});
};

const getTotalFilesCount = async () => File.countDocuments();
const countChildFiles = async folderId => File.countDocuments({folderId});

module.exports = {
  createFile,
  createFileRecordFromUploadResult,
  queryFiles,
  getFileById,
  updateFileById,
  deleteFileById,
  getFilesByFolderId,
  getFilteredFiles,
  getTotalFilesCount,
  countChildFiles,
};
