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
  const {name, description, dateFrom, dateTo, page = 1, limit = 10, includeChildCounts} = req.query;

  const folderFilter = {};
  if (name) folderFilter.name = name;
  if (description) folderFilter.description = description;
  if (dateFrom || dateTo) {
    folderFilter.createdAt = {};
    if (dateFrom) folderFilter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) folderFilter.createdAt.$lte = new Date(dateTo);
  }

  const fileFilter = {};
  const hasFileFilters = Boolean(name) || Boolean(dateFrom) || Boolean(dateTo);
  if (name) fileFilter.name = name;
  if (dateFrom) fileFilter.dateFrom = dateFrom;
  if (dateTo) fileFilter.dateTo = dateTo;

  const [foldersPage, filesPage] = await Promise.all([
    folderService.queryFolders(folderFilter, {page, limit}),
    hasFileFilters
      ? fileService.getFilteredFiles(fileFilter, {page, limit})
      : Promise.resolve({results: [], totalResults: 0, totalPages: 0}),
  ]);

  let folders = foldersPage.results || [];

  if (includeChildCounts === 'true' || includeChildCounts === true) {
    folders = await Promise.all(
      folders.map(async f => {
        const [childFolders, childFiles] = await Promise.all([
          folderService.countChildFolders(f._id),
          fileService.countChildFiles(f._id),
        ]);
        return {
          ...(f.toObject ? f.toObject() : f),
          counts: {childFolders, childFiles},
        };
      })
    );
  }

  res.json({
    status: true,
    folders,
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
