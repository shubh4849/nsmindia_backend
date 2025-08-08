const {UploadProgress} = require('../models');

/**
 * Update upload progress
 * @param {string} uploadId
 * @param {number} uploadedBytes
 * @param {number} totalBytes
 * @returns {Promise<UploadProgress>}
 */
const updateUploadProgress = async (uploadId, uploadedBytes, totalBytes) => {
  const progress = (uploadedBytes / totalBytes) * 100;
  const status = progress === 100 ? 'completed' : 'uploading';
  return UploadProgress.findByIdAndUpdate(
    uploadId,
    {uploadedBytes, progress, status, updatedAt: Date.now()},
    {new: true, upsert: true}
  );
};

/**
 * Get upload progress by id
 * @param {string} uploadId
 * @returns {Promise<UploadProgress>}
 */
const getUploadProgressById = async uploadId => {
  return UploadProgress.findById(uploadId);
};

/**
 * Clean up completed or failed uploads
 * @param {string} uploadId
 * @returns {Promise<void>}
 */
const cleanupUploadProgress = async uploadId => {
  await UploadProgress.findByIdAndDelete(uploadId);
};

module.exports = {
  updateUploadProgress,
  getUploadProgressById,
  cleanupUploadProgress,
};
