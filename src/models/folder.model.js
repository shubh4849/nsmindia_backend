const mongoose = require('mongoose');
const {paginate} = require('./plugins/paginate');

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null,
  },
  path: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

folderSchema.index({parentId: 1});
folderSchema.index({path: 1});

folderSchema.plugin(paginate);

folderSchema.statics.isNameTaken = async function(name, parentId, excludeFolderId) {
  const folder = await this.findOne({name, parentId, _id: {$ne: excludeFolderId}});
  return !!folder;
};

const Folder = mongoose.model('Folder', folderSchema);

module.exports = Folder;
