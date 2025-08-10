const {UploadProgress} = require('../models');

/**
 * Initialize upload progress with 0%
 * @param {string} uploadId
 * @param {{ fileName?: string, fileSize?: number }} meta
 */
const initUploadProgress = async (uploadId, meta = {}) => {
  const {fileName, fileSize} = meta;
  return UploadProgress.findByIdAndUpdate(
    uploadId,
    {
      _id: uploadId,
      fileName,
      fileSize,
      uploadedBytes: 0,
      progress: 0,
      status: 'uploading',
      updatedAt: Date.now(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    {new: true, upsert: true}
  );
};

/**
 * Update upload progress
 * @param {string} uploadId
 * @param {number} uploadedBytes
 * @param {number} totalBytes
 * @param {Object} [meta]
 * @param {string} [meta.fileName]
 * @param {('uploading'|'completed'|'failed')} [meta.status]
 * @returns {Promise<UploadProgress>}
 */
const updateUploadProgress = async (uploadId, uploadedBytes, totalBytes, meta = {}) => {
  const progress = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;
  const status = meta.status || (progress >= 100 ? 'completed' : 'uploading');
  const update = {
    uploadedBytes,
    progress,
    status,
    updatedAt: Date.now(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  if (typeof totalBytes === 'number') update.fileSize = totalBytes;
  if (meta.fileName) update.fileName = meta.fileName;
  return UploadProgress.findByIdAndUpdate(uploadId, update, {new: true, upsert: true});
};

/**
 * Mark upload as completed
 */
const completeUploadProgress = async uploadId => {
  return UploadProgress.findByIdAndUpdate(
    uploadId,
    {status: 'completed', progress: 100, updatedAt: Date.now()},
    {new: true}
  );
};

/**
 * Mark upload as failed
 */
const failUploadProgress = async (uploadId, meta = {}) => {
  const update = {status: 'failed', updatedAt: Date.now()};
  if (meta.fileName) update.fileName = meta.fileName;
  return UploadProgress.findByIdAndUpdate(uploadId, update, {new: true});
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

/**
 * Throttle calls to a function
 * @param {Function} fn
 * @param {number} intervalMs
 */
function throttle(fn, intervalMs) {
  let last = 0;
  let timeout = null;
  let pendingArgs = null;
  const invoke = () => {
    last = Date.now();
    timeout = null;
    const args = pendingArgs;
    pendingArgs = null;
    if (args) fn(...args);
  };
  return (...args) => {
    const now = Date.now();
    const remaining = last + intervalMs - now;
    pendingArgs = args;
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      invoke();
    } else if (!timeout) {
      timeout = setTimeout(invoke, remaining);
    }
  };
}

module.exports = {
  initUploadProgress,
  updateUploadProgress,
  completeUploadProgress,
  failUploadProgress,
  getUploadProgressById,
  cleanupUploadProgress,
  throttle,
};
