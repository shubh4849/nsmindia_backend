const httpStatus = require('http-status');
const {Folder, File} = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Build folder tree recursively
 * @param {Array<Object>} folders
 * @param {string|null} parentId
 * @returns {Array<Object>}
 */
const buildTree = (folders, parentId = null) => {
  const folderTree = [];
  folders.forEach(folder => {
    if (folder.parentId === parentId) {
      const children = buildTree(folders, folder._id);
      if (children.length > 0) {
        folder.children = children;
      }
      folderTree.push(folder);
    }
  });
  return folderTree;
};

/**
 * Create a folder
 * @param {Object} folderBody
 * @returns {Promise<Folder>}
 */
const createFolder = async folderBody => {
  if (await Folder.isNameTaken(folderBody.name, folderBody.parentId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Folder with this name already exists in the parent folder');
  }
  return Folder.create(folderBody);
};

/**
 * Query for folders
 * @param {Object} filter - Mongo filter (can include name, parentId)
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryFolders = async (filter, options) => {
  let query = {};

  if (filter.name) {
    query.name = new RegExp(filter.name, 'i');
  }

  // Apply parentId filter only if explicitly provided in filter (including null)
  if (Object.prototype.hasOwnProperty.call(filter, 'parentId')) {
    query.parentId = filter.parentId; // may be null for root-only
  }

  if (filter.description) query.description = new RegExp(filter.description, 'i');
  if (filter.createdAt) query.createdAt = filter.createdAt;

  const folders = await Folder.paginate(query, options);
  return folders;
};

/**
 * Get folder by id
 * @param {ObjectId} id
 * @returns {Promise<Folder>}
 */
const getFolderById = async id => {
  return Folder.findById(id);
};

/**
 * Update folder by id
 * @param {ObjectId} folderId
 * @param {Object} updateBody
 * @returns {Promise<Folder>}
 */
const updateFolderById = async (folderId, updateBody) => {
  const folder = await getFolderById(folderId);
  if (!folder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Folder not found');
  }
  if (updateBody.name && (await Folder.isNameTaken(updateBody.name, folder.parentId, folderId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Folder with this name already exists in the parent folder');
  }
  Object.assign(folder, updateBody);
  await folder.save();
  return folder;
};

/**
 * Delete folder by id
 * @param {ObjectId} folderId
 * @returns {Promise<Folder>}
 */
const deleteFolderById = async folderId => {
  const folder = await getFolderById(folderId);
  if (!folder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Folder not found');
  }
  await folder.remove();
  return folder;
};

/**
 * Get folder breadcrumb path
 * @param {ObjectId} folderId
 * @returns {Promise<Array<Object>>}
 */
const getFolderBreadcrumb = async folderId => {
  const breadcrumb = await Folder.aggregate([
    {
      $match: {_id: folderId},
    },
    {
      $graphLookup: {
        from: 'folders',
        startWith: '$parentId',
        connectFromField: 'parentId',
        connectToField: '_id',
        as: 'path',
        maxDepth: 10,
      },
    },
    {
      $unwind: '$path',
    },
    {
      $project: {
        _id: '$path._id',
        name: '$path.name',
        parentId: '$path.parentId',
      },
    },
    {
      $sort: {'path._id': 1},
    },
  ]);
  return breadcrumb;
};

/**
 * Cascade delete folder and its contents
 * @param {ObjectId} folderId
 * @returns {Promise<void>}
 */
const cascadeDeleteFolder = async folderId => {
  const foldersToDelete = [folderId];
  let currentFolders = [folderId];

  while (currentFolders.length > 0) {
    const childFolders = await Folder.find({parentId: {$in: currentFolders}}).select('_id');
    const childFiles = await File.find({folderId: {$in: currentFolders}}).select('_id');

    if (childFolders.length > 0) {
      const childFolderIds = childFolders.map(folder => folder._id);
      foldersToDelete.push(...childFolderIds);
      currentFolders = childFolderIds;
    } else {
      currentFolders = [];
    }

    if (childFiles.length > 0) {
      const childFileIds = childFiles.map(file => file._id);
      await File.deleteMany({_id: {$in: childFileIds}});
    }
  }

  await Folder.deleteMany({_id: {$in: foldersToDelete}});
};

/**
 * Get all folders with selected fields for tree building
 * @returns {Promise<Array<Folder>>}
 */
const getAllFolders = async () => {
  return Folder.find().select('_id name parentId path');
};

/**
 * Get folders by parentId
 * @param {ObjectId} parentId
 * @returns {Promise<Array<Folder>>}
 */
const getFoldersByParentId = async parentId => {
  return Folder.find({parentId});
};

/**
 * Get total count of folders
 * @returns {Promise<number>}
 */
const getTotalFoldersCount = async () => {
  return Folder.countDocuments();
};

/**
 * Get count of direct child folders for a given parentId
 * @param {ObjectId|null} parentId - The ID of the parent folder, or null for root
 * @returns {Promise<number>}
 */
const countChildFolders = async parentId => {
  return Folder.countDocuments({parentId});
};

module.exports = {
  buildTree,
  createFolder,
  queryFolders,
  getFolderById,
  updateFolderById,
  deleteFolderById,
  getFolderBreadcrumb,
  cascadeDeleteFolder,
  getAllFolders,
  getFoldersByParentId,
};

module.exports.getTotalFoldersCount = getTotalFoldersCount;
module.exports.countChildFolders = countChildFolders;
