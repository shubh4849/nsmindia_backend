const {Folder} = require('../models');

const progressSubscribers = new Map(); // uploadId -> Set(res)

function subscribeToUpload(uploadId, res) {
  if (!progressSubscribers.has(uploadId)) progressSubscribers.set(uploadId, new Set());
  const set = progressSubscribers.get(uploadId);
  set.add(res);
  return () => {
    try {
      set.delete(res);
      if (set.size === 0) progressSubscribers.delete(uploadId);
    } catch {}
  };
}

function emitUploadEvent(uploadId, event) {
  const set = progressSubscribers.get(uploadId);
  if (!set || set.size === 0) return 0;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const isTerminal =
    event?.status === 'completed' ||
    event?.status === 'failed' ||
    event?.event === 'UPLOAD_COMPLETED' ||
    event?.event === 'UPLOAD_FAILED';
  for (const res of Array.from(set)) {
    try {
      res.write(payload);
      if (isTerminal) {
        try {
          res.end();
        } catch {}
        set.delete(res);
      }
    } catch {}
  }
  if (isTerminal && set.size === 0) progressSubscribers.delete(uploadId);
  return set.size;
}

const getFolderChangeStream = folderId => {
  return Folder.watch([
    {$match: {'fullDocument.parentId': folderId}},
    {$match: {operationType: {$in: ['insert', 'update', 'delete']}}},
  ]);
};

module.exports = {
  getFolderChangeStream,
  subscribeToUpload,
  emitUploadEvent,
};
