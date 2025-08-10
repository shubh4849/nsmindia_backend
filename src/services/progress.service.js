const {UploadProgress} = require('../models');

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

const completeUploadProgress = async uploadId => {
  return UploadProgress.findByIdAndUpdate(
    uploadId,
    {status: 'completed', progress: 100, updatedAt: Date.now()},
    {new: true}
  );
};

const failUploadProgress = async (uploadId, meta = {}) => {
  const update = {status: 'failed', updatedAt: Date.now()};
  if (meta.fileName) update.fileName = meta.fileName;
  return UploadProgress.findByIdAndUpdate(uploadId, update, {new: true});
};

const getUploadProgressById = async uploadId => {
  return UploadProgress.findById(uploadId);
};

const cleanupUploadProgress = async uploadId => {
  await UploadProgress.findByIdAndDelete(uploadId);
};

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
