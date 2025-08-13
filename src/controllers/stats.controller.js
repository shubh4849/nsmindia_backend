const httpStatus = require('http-status');
const {folderService, fileService} = require('../services');
const catchAsync = require('../utils/catchAsync');

// GET /v1/stats/counts → { status: true, counts: { folders, files } }
const getCounts = catchAsync(async (req, res) => {
  const [folders, files] = await Promise.all([folderService.getTotalFoldersCount(), fileService.getTotalFilesCount()]);
  res.set('Cache-Control', 'no-store');
  res.status(httpStatus.OK).send({status: true, counts: {folders, files}});
});

module.exports = {getCounts};
