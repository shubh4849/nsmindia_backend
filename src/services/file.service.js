const httpStatus = require('http-status');
const {File} = require('../models');
const ApiError = require('../utils/ApiError');
const {fileUploadService} = require('../microservices');
const {v4: uuidv4} = require('uuid');
const config = require('../config/config');
const {mapResourceType, resolveExtension, buildPublicUrlFromBase} = require('../utils/cloudinary');

function deriveStorageIdentifiers(urlString) {
  try {
    const url = new URL(urlString);
    const path = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

    // R2 path: <base>/<key>
    const r2Base = config.r2.publicBaseUrl.replace(/\/$/, '');
    const r2BaseUrl = new URL(r2Base);
    if (url.host === r2BaseUrl.host) {
      // If base has path prefix, strip it
      const basePath = r2BaseUrl.pathname.replace(/^\//, '');
      const key = basePath && path.startsWith(`${basePath}/`) ? path.slice(basePath.length + 1) : path;
      return {publicId: key, resourceType: 'raw'};
    }

    // Legacy Cloudinary path: .../<resourceType>/upload/.../<publicId>[.ext]
    const parts = path.split('/');
    const uploadIndex = parts.findIndex(p => p === 'upload');
    if (uploadIndex !== -1) {
      const resourceType = parts[uploadIndex - 1] || 'raw';
      const afterUpload = parts.slice(uploadIndex + 1);
      const afterVersion = afterUpload[0] && /^v\d+/.test(afterUpload[0]) ? afterUpload.slice(1) : afterUpload;
      if (afterVersion.length > 0) {
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
      }
    }

    return {publicId: null, resourceType: 'raw'};
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
    mimeType,
  });

  const extension = resolveExtension({format: uploadResult.format, mimeType, originalName});
  const publicViewUrl = buildPublicUrlFromBase({
    baseUrl: config.r2.publicBaseUrl,
    key: uploadResult.public_id,
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
  const publicViewUrl = buildPublicUrlFromBase({
    baseUrl: config.r2.publicBaseUrl,
    key: uploadResult.public_id,
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
    const derived = deriveStorageIdentifiers(file.filePath || '');
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
      console.log('[DeleteFile] Storage delete response', destroyRes);
    } else {
      console.warn('[DeleteFile] No publicId available, skipping storage delete');
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

  try {
    if (file.folderId) {
      const remaining = await File.countDocuments({folderId: file.folderId});
      if (remaining === 0) {
        const folderPath = `files/${file.folderId}`;
        const delFolderRes = await fileUploadService.deleteFolderIfEmpty(folderPath);
        console.log('[DeleteFile] Storage delete_folder attempt', {folderPath, delFolderRes});
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
