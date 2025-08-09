const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {folderService, fileService} = require('../services');
const {getPaginateConfig} = require('../utils/queryPHandler');

const createFolder = catchAsync(async (req, res) => {
  const folder = await folderService.createFolder(req.body);
  res.status(httpStatus.CREATED).send(folder);
});

const getFolders = catchAsync(async (req, res) => {
  // Extract includeChildCounts separately so it doesn't enter filters
  const {includeChildCounts, ...rest} = req.query;
  const {filters, options} = getPaginateConfig(rest);

  if (includeChildCounts === 'true' || includeChildCounts === true) {
    options.pipeline = [
      {
        $lookup: {
          from: 'folders',
          let: {parent: '$_id'},
          pipeline: [{$match: {$expr: {$eq: ['$parentId', '$$parent']}}}, {$project: {_id: 1}}],
          as: 'childFoldersDocs',
        },
      },
      {
        $lookup: {
          from: 'files',
          let: {folder: '$_id'},
          pipeline: [{$match: {$expr: {$eq: ['$folderId', '$$folder']}}}, {$project: {_id: 1}}],
          as: 'childFilesDocs',
        },
      },
      {$addFields: {counts: {childFolders: {$size: '$childFoldersDocs'}, childFiles: {$size: '$childFilesDocs'}}}},
      {$project: {childFoldersDocs: 0, childFilesDocs: 0}},
    ];
  }

  const result = await folderService.queryFolders(filters, options);
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
  const {page = 1, limit = 10, name, description, dateFrom, dateTo} = req.query;
  const folders = await folderService.getFoldersByParentId(req.params.folderId);

  const filesPage = await fileService.getFilesByFolderId(
    req.params.folderId,
    {name, description, dateFrom, dateTo},
    {page, limit}
  );

  const files = filesPage.results || [];
  const totalFiles = filesPage.totalResults || 0;
  const totalPagesFiles = filesPage.totalPages || Math.ceil(totalFiles / parseInt(limit));

  res.json({
    folders,
    files,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalFolders: folders.length,
      totalFiles: totalFiles,
      totalPagesFolders: Math.ceil(folders.length / limit),
      totalPagesFiles: totalPagesFiles,
    },
  });
});

const getFolderBreadcrumb = catchAsync(async (req, res) => {
  const breadcrumb = await folderService.getFolderBreadcrumb(req.params.folderId);
  res.send(breadcrumb);
});

const getFilteredFolderContents = catchAsync(async (req, res) => {
  const {folderId} = req.params;
  const {q, type, dateFrom, dateTo, name, description, page = 1, limit = 10} = req.query;

  const folders = await folderService.getFoldersByParentId(folderId);
  const filesPage = await fileService.getFilteredFiles(
    {folderId, q, type, dateFrom, dateTo, name, description},
    {page, limit}
  );

  const files = filesPage.results || [];
  const totalFiles = filesPage.totalResults || 0;
  const totalPagesFiles = filesPage.totalPages || Math.ceil(totalFiles / parseInt(limit));

  res.json({
    folders,
    files,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalFolders: folders.length,
      totalFiles: totalFiles,
      totalPagesFiles: totalPagesFiles,
    },
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
