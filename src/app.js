const cors = require('cors');
const express = require('express');
const compression = require('compression');

const helmet = require('helmet');

const httpStatus = require('http-status');
const routes = require('./routes/v1');
const morgan = require('./config/morgan');
const config = require('./config/config');
const ApiError = require('./utils/ApiError');
const {errorConverter, errorHandler} = require('./middlewares/error');

const app = express();

// Disable ETag to avoid 304 caching interfering with dynamic payloads
app.set('etag', false);

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

app.use(helmet());

app.use(express.json());

app.use(express.urlencoded({extended: true}));

app.use(
  compression({
    filter: (req, res) => {
      if (req.path && req.path.startsWith('/v1/sse/')) return false;

      const accept = req.headers.accept || '';
      if (accept.includes('text/event-stream')) return false;
      return compression.filter(req, res);
    },
  })
);

app.use(cors());
app.options('*', cors());

app.use('/v1', routes);

app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

app.use(errorConverter);

app.use(errorHandler);

module.exports = app;
