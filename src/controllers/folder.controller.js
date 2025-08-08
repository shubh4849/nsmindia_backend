const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {folderService, fileService} = require('../services');
const {getPaginateConfig} = require('../utils/queryPHandler');

const createFolder = catchAsync(async (req, res) => {
  const folder = await folderService.createFolder(req.body);
  res.status(httpStatus.CREATED).send(folder);
});

const getFolders = catchAsync(async (req, res) => {
  const {name, parentId, ...otherOptions} = req.query;
  const {filters, options} = getPaginateConfig(otherOptions);
  
  const queryFilters = {
    ...filters,
    ...(name && {name}),
    ...(parentId !== undefined && {parentId})
  };
  
  const result = await folderService.queryFolders(queryFilters, options);
  res.send(result);
});

const getFolder = catchAsync(async (req, res) => {
  const folder = await folderService.getFolderById(req.params.folderId);
  if (!folder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Folder not found');
  }
  res.send(folder);
});

const updateFolder = catchAsync(async (req, res) => {
  const folder = await folderService.updateFolderById(req.params.folderId, req.body);
  res.send(folder);
});

const deleteFolder = catchAsync(async (req, res) => {
  await folderService.cascadeDeleteFolder(req.params.folderId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getFolderTree = catchAsync(async (req, res) => {
  const folders = await folderService.getAllFolders();
  const tree = folderService.buildTree(folders);
  res.send(tree);
});

const getFolderContents = catchAsync(async (req, res) => {
  const {name, description, dateFrom, dateTo, ...otherOptions} = req.query;
  const {options} = getPaginateConfig(otherOptions);
  
  const folders = await folderService.getFoldersByParentId(req.params.folderId);
  const result = await fileService.getFilesByFolderId(
    req.params.folderId,
    {name, description, dateFrom, dateTo},
    options
  );

  res.json({
    folders,
    ...result
  });
});

const getFolderBreadcrumb = catchAsync(async (req, res) => {
  const breadcrumb = await folderService.getFolderBreadcrumb(req.params.folderId);
  res.send(breadcrumb);
});

const getFilteredFolderContents = catchAsync(async (req, res) => {
  const {folderId} = req.params;
  const {q, type, dateFrom, dateTo, name, description, ...otherOptions} = req.query;
  const {options} = getPaginateConfig(otherOptions);

  const folders = await folderService.getFoldersByParentId(folderId);
  const result = await fileService.getFilteredFiles(
    {
      folderId,
      q,
      type,
      dateFrom,
      dateTo,
      name,
      description,
    },
    options
  );

  res.json({
    folders,
    ...result
  });
});

const getTotalFolders = catchAsync(async (req, res) => {
  const count = await folderService.getTotalFoldersCount();
  res.status(httpStatus.OK).send({count});
});

const getDirectChildFoldersCount = catchAsync(async (req, res) => {
  const {folderId} = req.params;
  const count = await folderService.countChildFolders(folderId);
  res.status(httpStatus.OK).send({count});
});

const getDirectChildFilesCount = catchAsync(async (req, res) => {
  const {folderId} = req.params;
  const count = await fileService.countChildFiles(folderId);
  res.status(httpStatus.OK).send({count});
});

module.exports = {
  createFolder,
  getFolders,
  getFolder,
  updateFolder,
  deleteFolder,
  getFolderTree,
  getFolderContents,
  getFolderBreadcrumb,
  getFilteredFolderContents,
  getTotalFolders,
};

module.exports.getDirectChildFoldersCount = getDirectChildFoldersCount;
module.exports.getDirectChildFilesCount = getDirectChildFilesCount;
