const mongoose = require('mongoose');
const {paginate} = require('./plugins/paginate');

const uploadProgressSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
    required: false,
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

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000),
    index: {expires: 60 * 60},
  },
});

uploadProgressSchema.index({status: 1});

uploadProgressSchema.plugin(paginate);

const UploadProgress = mongoose.model('UploadProgress', uploadProgressSchema);

module.exports = UploadProgress;
