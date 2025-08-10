const multer = require('multer');
const {fileTypes} = require('../constants');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (fileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(httpStatus.BAD_REQUEST, 'Invalid file type.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

module.exports = upload;
