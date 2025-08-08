const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const {progressService, sseService} = require('../services');

const getUploadProgress = catchAsync(async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const {uploadId} = req.params;
  const sendProgress = data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Monitor upload progress from database
  const interval = setInterval(async () => {
    const progress = await progressService.getUploadProgressById(uploadId);
    if (progress) {
      sendProgress({
        progress: progress.progress,
        status: progress.status,
        fileName: progress.fileName,
      });

      if (progress.status === 'completed' || progress.status === 'failed') {
        clearInterval(interval);
        await progressService.cleanupUploadProgress(uploadId);
        res.end();
      }
    } else {
      // If progress record is not found, it might have been cleaned up or never existed
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

const getFolderUpdates = catchAsync(async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

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
