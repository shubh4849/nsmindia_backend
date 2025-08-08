const dbOptions = {
  page: 1,
  limit: 10,
  sortBy: 'createdAt',
  sortOrder: 'asc',
};

const {ALL_ALLOWED_FILE_TYPES} = require('./fileTypes');

module.exports = {
  dbOptions,
  fileTypes: ALL_ALLOWED_FILE_TYPES,
};
