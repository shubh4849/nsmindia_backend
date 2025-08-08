const {Folder} = require('../models');

/**
 * Get folder change stream
 * @param {ObjectId} folderId
 * @returns {ChangeStream}
 */
const getFolderChangeStream = folderId => {
  return Folder.watch([
    {$match: {'fullDocument.parentId': folderId}},
    {$match: {operationType: {$in: ['insert', 'update', 'delete']}}},
  ]);
};

module.exports = {
  getFolderChangeStream,
};
