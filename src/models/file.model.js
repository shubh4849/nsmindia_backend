const mongoose = require('mongoose');
const {paginate} = require('./plugins/paginate');

const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  originalName: {
    type: String,
    required: true,
    trim: true,
  },
  filePath: {
    type: String,
    required: true,
    trim: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    // required: true,
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

fileSchema.index({folderId: 1});
fileSchema.index({name: 1});
fileSchema.index({name: 'text', description: 'text'});

// add plugin that converts mongoose to json
fileSchema.plugin(paginate);

/**
 * @typedef File
 */
const File = mongoose.model('File', fileSchema);

module.exports = File;
