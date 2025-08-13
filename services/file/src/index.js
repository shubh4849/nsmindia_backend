const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const httpStatus = require('http-status');

const {Schema, model} = mongoose;
const fileSchema = new Schema(
  {
    name: {type: String, required: true},
    originalName: {type: String},
    filePath: {type: String, required: true},
    publicId: {type: String},
    key: {type: String},
    resourceType: {type: String},
    format: {type: String},
    deliveryType: {type: String},
    fileSize: {type: Number},
    mimeType: {type: String},
    folderId: {type: Schema.Types.Mixed, default: null},
  },
  {timestamps: true, versionKey: false}
);
const File = model('File', fileSchema, 'files');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(compression());

app.use((req, res, next) => {
  if (req.path !== '/healthz') console.log(`[FileService] ${req.method} ${req.url}`);
  next();
});

app.get('/healthz', (req, res) => res.json({status: 'ok'}));
app.get('/debug', (req, res) => res.json({status: 'debug_ok', port: process.env.PORT, t: Date.now()}));

app.get('/files', async (req, res) => {
  const {page = 1, limit = 10, name, description, folderId} = req.query;
  const q = {};
  if (name) q.originalName = new RegExp(name, 'i');
  if (description) q.description = new RegExp(description, 'i');
  if (folderId) q.folderId = folderId;
  const docs = await File.find(q)
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  res.json({status: true, results: docs});
});

app.get('/files/count', async (req, res) => {
  const count = await File.countDocuments();
  res.json({status: true, count});
});

app.get('/files/:fileId', async (req, res) => {
  const doc = await File.findById(req.params.fileId);
  if (!doc) return res.status(httpStatus.NOT_FOUND).json({status: false, message: 'File not found'});
  res.json({status: true, ...(doc.toObject ? doc.toObject() : doc)});
});

app.get('/files/search', async (req, res) => {
  const {name, dateFrom, dateTo, page = 1, limit = 10} = req.query;
  const q = {};
  if (name) q.originalName = new RegExp(name, 'i');
  if (dateFrom || dateTo) {
    q.createdAt = {};
    if (dateFrom) q.createdAt.$gte = new Date(dateFrom);
    if (dateTo) q.createdAt.$lte = new Date(dateTo);
  }
  const docs = await File.find(q)
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  res.json({status: true, results: docs});
});

const PORT = process.env.PORT || 3002;
const MONGODB_URL = process.env.MONGODB_URL;

app.listen(PORT, '0.0.0.0', () => console.log(`File service listening on ${PORT}`));

(async function connectWithRetry(retries = 5) {
  try {
    console.log('[FileService] Connecting to Mongo…');
    await mongoose.connect(MONGODB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
    console.log('[FileService] Mongo connected');
  } catch (err) {
    console.error('[FileService] Mongo connect error', err?.message);
    if (retries > 0) setTimeout(() => connectWithRetry(retries - 1), 2000);
  }
})();
