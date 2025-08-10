const {Folder} = require('../models');

const getFolderChangeStream = folderId => {
  return Folder.watch([
    {$match: {'fullDocument.parentId': folderId}},
    {$match: {operationType: {$in: ['insert', 'update', 'delete']}}},
  ]);
};

module.exports = {
  getFolderChangeStream,
};
