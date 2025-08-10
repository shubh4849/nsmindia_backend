const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {folderService, fileService} = require('../services');
const {getPaginateConfig} = require('../utils/queryPHandler');

const createFolder = catchAsync(async (req, res) => {
  const folder = await folderService.createFolder(req.body);
  res.status(httpStatus.CREATED).send({status: true, ...folder.toObject?.()});
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
  res.send({status: true, ...result});
});

const getFolder = catchAsync(async (req, res) => {
  const folder = await folderService.getFolderById(req.params.folderId);
  if (!folder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Folder not found');
  }
  res.send({status: true, ...folder.toObject?.()});
});

const updateFolder = catchAsync(async (req, res) => {
  const folder = await folderService.updateFolderById(req.params.folderId, req.body);
  res.send({status: true, ...folder.toObject?.()});
});

const deleteFolder = catchAsync(async (req, res) => {
  await folderService.cascadeDeleteFolder(req.params.folderId);
  res.status(httpStatus.OK).send({status: true});
});

const getFolderTree = catchAsync(async (req, res) => {
  const folders = await folderService.getAllFolders();
  const tree = folderService.buildTree(folders);
  res.send({status: true, results: tree});
});

const getRootContents = catchAsync(async (req, res) => {
  const {page = 1, limit = 10, name, description, dateFrom, dateTo} = req.query;
  const folders = await folderService.queryFolders({parentId: null}, {page, limit});

  const filesPage = await fileService.getFilteredFiles(
    {folderId: null, name, description, dateFrom, dateTo},
    {page, limit}
  );

  const files = filesPage.results || [];
  const totalFiles = filesPage.totalResults || 0;
  const totalPagesFiles = filesPage.totalPages || Math.ceil(totalFiles / parseInt(limit));

  res.json({
    status: true,
    folders: folders.results || [],
    files,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalFolders: (folders.results || []).length,
      totalFiles,
      totalPagesFolders: Math.ceil((folders.results || []).length / limit),
      totalPagesFiles,
    },
  });
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
    status: true,
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
  res.send({status: true, results: breadcrumb});
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
    status: true,
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
  res.status(httpStatus.OK).send({status: true, count});
});

const getDirectChildFoldersCount = catchAsync(async (req, res) => {
  const {folderId} = req.params;
  const count = await folderService.countChildFolders(folderId);
  res.status(httpStatus.OK).send({status: true, count});
});

const getDirectChildFilesCount = catchAsync(async (req, res) => {
  const {folderId} = req.params;
  const count = await fileService.countChildFiles(folderId);
  res.status(httpStatus.OK).send({status: true, count});
});

const unifiedSearch = catchAsync(async (req, res) => {
  const {name, description, dateFrom, dateTo, folderId, page = 1, limit = 10} = req.query;

  // Folders filter
  const folderFilter = {};
  if (typeof folderId !== 'undefined') {
    folderFilter.parentId = folderId === 'null' ? null : folderId;
  }
  if (name) folderFilter.name = name; // service applies regex
  if (description) folderFilter.description = description; // service applies regex
  if (dateFrom || dateTo) {
    folderFilter.createdAt = {};
    if (dateFrom) folderFilter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) folderFilter.createdAt.$lte = new Date(dateTo);
  }

  // Files filter
  const fileFilter = {};
  if (typeof folderId !== 'undefined') {
    fileFilter.folderId = folderId === 'null' ? null : folderId;
  }
  if (name) fileFilter.name = name; // used to match originalName in service
  if (dateFrom) fileFilter.dateFrom = dateFrom;
  if (dateTo) fileFilter.dateTo = dateTo;

  const [foldersPage, filesPage] = await Promise.all([
    folderService.queryFolders(folderFilter, {page, limit}),
    fileService.getFilteredFiles(fileFilter, {page, limit}),
  ]);

  res.json({
    status: true,
    folders: foldersPage.results || [],
    files: filesPage.results || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalFolders: foldersPage.totalResults || 0,
      totalFiles: filesPage.totalResults || 0,
      totalPagesFolders: foldersPage.totalPages || 0,
      totalPagesFiles: filesPage.totalPages || 0,
    },
  });
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
  getRootContents,
  unifiedSearch,
};

module.exports.getDirectChildFoldersCount = getDirectChildFoldersCount;
module.exports.getDirectChildFilesCount = getDirectChildFilesCount;
