const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const mongoose = require('mongoose');
const {start: startProgressConsumer} = require('./consumers/progress.consumer');
const {start: startFileConsumer} = require('./consumers/file.consumer');
const {start: startFolderConsumer} = require('./consumers/folder.consumer');
let server;

mongoose
  .connect(config.mongoose.url, config.mongoose.options)
  .then(() => {
    console.log('Connected to mongodb');
  })
  .catch(err => {
    console.log(err);
  });

app.listen(config.port, () => {
  console.log(`NSM INDIA BACKEND app listening on port ${config.port}!`);
  // Print current proxy targets for clarity
  try {
    console.log('[Gateway] SSE_SERVICE_URL =', config.sse?.baseUrl || 'not set');
    console.log('[Gateway] FOLDER_SERVICE_URL =', config.services?.folderServiceUrl || 'not set');
    console.log('[Gateway] FILE_SERVICE_URL =', config.services?.fileServiceUrl || 'not set');
  } catch {}
  // Start background consumers (progress consumer is optional when proxying to external SSE)
  if (config.sse.progressConsumerEnabled) startProgressConsumer();
  startFileConsumer();
  startFolderConsumer();
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = error => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
});
