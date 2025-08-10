const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const {progressService, sseService} = require('../services');

const getUploadProgress = catchAsync(async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no', // nginx
  });
  if (res.flushHeaders) res.flushHeaders();

  const {uploadId} = req.params;
  const send = (event, data) => {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // immediate connected frame
  send('connected', {uploadId, status: 'uploading', progress: 0});

  const startedAt = Date.now();
  const maxWaitMs = 15 * 1000; // wait up to 15s for record to appear

  const interval = setInterval(async () => {
    try {
      const progress = await progressService.getUploadProgressById(uploadId);
      if (progress) {
        send(null, {
          uploadId,
          progress: progress.progress,
          status: progress.status,
          fileName: progress.fileName,
          uploadedBytes: progress.uploadedBytes,
          fileSize: progress.fileSize,
        });
        if (progress.status === 'completed' || progress.status === 'failed') {
          clearInterval(interval);
          clearInterval(heartbeat);
          await progressService.cleanupUploadProgress(uploadId);
          res.end();
        }
      } else if (Date.now() - startedAt > maxWaitMs) {
        // give up after timeout but leave connection to be closed by client
        send('timeout', {uploadId, status: 'uploading', progress: 0});
      }
    } catch (e) {
      clearInterval(interval);
      clearInterval(heartbeat);
      res.end();
    }
  }, 1000);

  // heartbeat to keep proxies happy
  const heartbeat = setInterval(() => {
    send('ping', {t: Date.now()});
  }, 10000);

  req.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    res.end();
  });
});

const getFolderUpdates = catchAsync(async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  if (res.flushHeaders) res.flushHeaders();

  const {folderId} = req.params;

  const changeStream = sseService.getFolderChangeStream(folderId);

  changeStream.on('change', change => {
    res.write(`event: folderUpdate\ndata: ${JSON.stringify(change.fullDocument)}\n\n`);
  });

  req.on('close', () => {
    changeStream.close();
    res.end();
  });
});

module.exports = {
  getUploadProgress,
  getFolderUpdates,
};
