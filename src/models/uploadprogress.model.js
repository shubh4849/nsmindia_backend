const mongoose = require('mongoose');
const {paginate} = require('./plugins/paginate');

const uploadProgressSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
    trim: true,
  },
  progress: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['uploading', 'completed', 'failed'],
    default: 'uploading',
  },
  fileSize: {
    type: Number,
  },
  uploadedBytes: {
    type: Number,
    default: 0,
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

uploadProgressSchema.index({status: 1});

// add plugin that converts mongoose to json
uploadProgressSchema.plugin(paginate);

/**
 * @typedef UploadProgress
 */
const UploadProgress = mongoose.model('UploadProgress', uploadProgressSchema);

module.exports = UploadProgress;
