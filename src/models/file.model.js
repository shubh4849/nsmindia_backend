const mongoose = require('mongoose');
const {paginate} = require('./plugins/paginate');

const fileSchema = new mongoose.Schema({
  name: {type: String, required: true, trim: true},
  originalName: {type: String, required: true, trim: true},
  filePath: {type: String, required: true, trim: true},

  publicId: {type: String, trim: true},
  key: {type: String, trim: true},
  resourceType: {type: String, trim: true},
  format: {type: String, trim: true},
  deliveryType: {type: String, trim: true, default: 'upload'},
  fileSize: {type: Number, required: true},
  mimeType: {type: String, required: true},
  folderId: {type: mongoose.Schema.Types.ObjectId, ref: 'Folder'},
  description: {type: String, trim: true},
  createdAt: {type: Date, default: Date.now},
  updatedAt: {type: Date, default: Date.now},
});

fileSchema.index({folderId: 1});
fileSchema.index({name: 1});
fileSchema.index({publicId: 1});
fileSchema.index({key: 1});
fileSchema.index({name: 'text', description: 'text'});

fileSchema.plugin(paginate);

const File = mongoose.model('File', fileSchema);

module.exports = File;
