const mongoose = require('mongoose');
const {paginate} = require('./plugins/paginate');

const fileSchema = new mongoose.Schema({
  name: {type: String, required: true, trim: true},
  originalName: {type: String, required: true, trim: true},
  filePath: {type: String, required: true, trim: true},
  // Cloudinary identifiers for simpler management
  publicId: {type: String, trim: true},
  key: {type: String, trim: true}, // mirrors publicId for S3-like naming
  resourceType: {type: String, trim: true}, // image | video | raw
  format: {type: String, trim: true}, // e.g. jpg, pdf, xlsx
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

// add plugin that converts mongoose to json
fileSchema.plugin(paginate);

/**
 * @typedef File
 */
const File = mongoose.model('File', fileSchema);

module.exports = File;
