const httpStatus = require('http-status');
const {File} = require('../models');
const ApiError = require('../utils/ApiError');
const {fileUploadService} = require('../microservices');
const {v4: uuidv4} = require('uuid');
const config = require('../config/config');
const {mapResourceType, buildPublicViewUrl, resolveExtension} = require('../utils/cloudinary');

function deriveCloudinaryIdentifiers(secureUrl) {
  try {
    const url = new URL(secureUrl);
    const parts = url.pathname.split('/');
    const uploadIndex = parts.findIndex(p => p === 'upload');
    if (uploadIndex === -1) return {publicId: null, resourceType: 'raw'};
    const resourceType = parts[uploadIndex - 1] || 'raw';
    const afterUpload = parts.slice(uploadIndex + 1);
    const afterVersion = afterUpload[0] && /^v\d+/.test(afterUpload[0]) ? afterUpload.slice(1) : afterUpload;
    if (afterVersion.length === 0) return {publicId: null, resourceType};

    const decodedSegments = afterVersion.map(seg => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    });
    const last = decodedSegments[decodedSegments.length - 1];
    const withoutExt = last.includes('.') ? last.substring(0, last.lastIndexOf('.')) : last;
    const publicPath = [...decodedSegments.slice(0, -1), withoutExt].join('/');
    return {publicId: publicPath, resourceType};
  } catch (e) {
    return {publicId: null, resourceType: 'raw'};
  }
}

const createFile = async ({buffer, originalName, mimeType, fileSize, folderId}) => {
  const folderPath = `files/${folderId || 'root'}`;
  const base = fileUploadService.sanitizeBaseName(originalName);
  const uniqueBase = `${uuidv4()}-${base}`;

  const resourceType = mapResourceType(mimeType);

  const uploadResult = await fileUploadService.uploadFileToCloudinary({
    fileBuffer: buffer,
    folder: folderPath,
    publicId: uniqueBase,
    resourceType,
  });

  const extension = resolveExtension({format: uploadResult.format, mimeType, originalName});
  const publicViewUrl = buildPublicViewUrl({
    cloudName: config.cloudinary.cloudName,
    resourceType: uploadResult.resource_type,
    publicId: uploadResult.public_id,
    extension,
  });

  const fileBody = {
    name: base || originalName,
    originalName,
    filePath: uploadResult.secure_url,
    publicViewUrl,
    publicId: uploadResult.public_id,
    key: uploadResult.public_id,
    resourceType: uploadResult.resource_type,
    format: extension || uploadResult.format,
    deliveryType: 'upload',
    fileSize,
    mimeType,
    folderId,
  };
  return File.create(fileBody);
};

const createFileRecordFromUploadResult = async ({uploadResult, originalName, mimeType, fileSize, folderId}) => {
  const base = fileUploadService.sanitizeBaseName(originalName || uploadResult.original_filename || 'file');

  const extension = resolveExtension({format: uploadResult.format, mimeType, originalName});
  const publicViewUrl = buildPublicViewUrl({
    cloudName: config.cloudinary.cloudName,
    resourceType: uploadResult.resource_type || mapResourceType(mimeType),
    publicId: uploadResult.public_id,
    extension,
  });

  const fileBody = {
    name: base || originalName,
    originalName: originalName || uploadResult.original_filename || base,
    filePath: uploadResult.secure_url,
    publicViewUrl,
    publicId: uploadResult.public_id,
    key: uploadResult.public_id,
    resourceType: uploadResult.resource_type,
    format: extension || uploadResult.format,
    deliveryType: uploadResult.type || 'upload',
    fileSize,
    mimeType: mimeType || uploadResult.resource_type,
    folderId,
  };
  return File.create(fileBody);
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

  let publicId = file.key || file.publicId;
  let resourceType = file.resourceType;
  if (!publicId || !resourceType) {
    const derived = deriveCloudinaryIdentifiers(file.filePath || '');
    publicId = publicId || derived.publicId;
    resourceType = resourceType || derived.resourceType;
  }
  console.log('[DeleteFile] Identifiers', {publicId, resourceType, url: file.filePath});

  try {
    if (publicId) {
      const destroyRes = await fileUploadService.deleteFileFromCloudinary(publicId, {
        resource_type: resourceType || 'raw',
        type: 'upload',
        invalidate: true,
      });
      console.log('[DeleteFile] Cloudinary destroy response', destroyRes);
    } else {
      console.warn('[DeleteFile] No publicId available, skipping Cloudinary destroy');
    }
  } catch (err) {
    console.error('[DeleteFile] Cloudinary destroy error', err);
  }

  try {
    await file.deleteOne();
    console.log('[DeleteFile] Mongo document deleted', {fileId});
  } catch (err) {
    console.error('[DeleteFile] Mongo delete error', err);
    throw err;
  }

  try {
    if (file.folderId) {
      const remaining = await File.countDocuments({folderId: file.folderId});
      if (remaining === 0) {
        const folderPath = `files/${file.folderId}`;
        const delFolderRes = await fileUploadService.deleteFolderIfEmpty(folderPath);
        console.log('[DeleteFile] Cloudinary delete_folder attempt', {folderPath, delFolderRes});
      }
    }
  } catch (err) {
    console.warn('[DeleteFile] delete_folder check failed', err);
  }

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
