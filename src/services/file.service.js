const httpStatus = require('http-status');
const {File} = require('../models');
const ApiError = require('../utils/ApiError');
const {fileUploadService} = require('../microservices');

/**
 * Create a file
 * @param {Object} fileDetails - Object containing file data and metadata
 * @param {Buffer} fileDetails.buffer - The file buffer
 * @param {string} fileDetails.originalName - The original name of the file
 * @param {string} fileDetails.mimeType - The mime type of the file
 * @param {number} fileDetails.fileSize - The size of the file
 * @param {ObjectId} fileDetails.folderId - The folder ID
 * @returns {Promise<File>}
 */
const createFile = async ({buffer, originalName, mimeType, fileSize, folderId}) => {
  // Upload file to Cloudinary
  const uploadResult = await fileUploadService.uploadFileToCloudinary(
    buffer,
    `files/${folderId || 'root'}`,
    originalName
  );

  const fileBody = {
    name: uploadResult.original_filename || originalName, // Use original_filename from Cloudinary or originalName
    originalName: originalName,
    filePath: uploadResult.secure_url, // Store the secure URL from Cloudinary
    fileSize: fileSize,
    mimeType: mimeType,
    folderId: folderId,
  };

  return File.create(fileBody);
};

/**
 * Query for files (supports paginate plugin options)
 * @param {Object} filters - Mongo filter
 * @param {Object} options - Query options from getPaginateConfig
 * @returns {Promise<QueryResult>}
 */
const queryFiles = async (filters, options) => {
  // Map simple filters if present
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

/**
 * Get file by id
 * @param {ObjectId} id
 * @returns {Promise<File>}
 */
const getFileById = async id => {
  return File.findById(id);
};

/**
 * Update file by id
 * @param {ObjectId} fileId
 * @param {Object} updateBody
 * @returns {Promise<File>}
 */
const updateFileById = async (fileId, updateBody) => {
  const file = await getFileById(fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  Object.assign(file, updateBody);
  await file.save();
  return file;
};

/**
 * Delete file by id and clean up physical file (now from Cloudinary)
 * @param {ObjectId} fileId
 * @returns {Promise<File>}
 */
const deleteFileById = async fileId => {
  const file = await getFileById(fileId);
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  const cloudinaryPublicId = file.filePath
    .split('/')
    .pop()
    .split('.')[0]; // Extract public ID from URL
  await fileUploadService.deleteFileFromCloudinary(cloudinaryPublicId);
  await file.remove();

  return file;
};

/**
 * Get files by folder id
 * @param {ObjectId} folderId
 * @returns {Promise<Array<File>>}
 */
const getFilesByFolderId = async (folderId, filterParams = {}, options = {}) => {
  return getFilteredFiles({...filterParams, folderId}, options);
};

/**
 * Get filtered files
 * @param {Object} filter - Mongo filter (includes q, folderId, type, dateFrom, dateTo, name, description)
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getFilteredFiles = async (filter, options) => {
  let query = {};
  if (filter.folderId) {
    query.folderId = filter.folderId;
  }

  // Prioritize text search (q) if provided, as it covers both name and description
  if (filter.q) {
    query.$text = {$search: filter.q};
  } else {
    // Apply individual name/description regex searches if q is not present
    if (filter.name) {
      query.name = new RegExp(filter.name, 'i');
    }
    if (filter.description) {
      query.description = new RegExp(filter.description, 'i');
    }
  }

  if (filter.type) {
    query.mimeType = new RegExp(filter.type, 'i');
  }
  if (filter.dateFrom || filter.dateTo) {
    query.createdAt = {};
    if (filter.dateFrom) query.createdAt.$gte = new Date(filter.dateFrom);
    if (filter.dateTo) query.createdAt.$lte = new Date(filter.dateTo);
  }

  // Support pipeline/project/populate via paginate options
  const paginateOptions = options || {};
  return File.paginate(query, paginateOptions);
};

/**
 * Get total count of files
 * @returns {Promise<number>}
 */
const getTotalFilesCount = async () => {
  return File.countDocuments();
};

/**
 * Get count of direct child files for a given folderId
 * @param {ObjectId} folderId - The ID of the parent folder
 * @returns {Promise<number>}
 */
const countChildFiles = async folderId => {
  return File.countDocuments({folderId});
};

module.exports = {
  createFile,
  queryFiles,
  getFileById,
  updateFileById,
  deleteFileById,
  getFilesByFolderId,
  getFilteredFiles,
  getTotalFilesCount,
  countChildFiles,
};
