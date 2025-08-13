const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const httpStatus = require('http-status');

// Minimal Folder model and routes mirrored from monolith
const {Schema, model} = mongoose;
const folderSchema = new Schema(
  {
    name: {type: String, required: true, trim: true},
    description: {type: String},
    parentId: {type: Schema.Types.Mixed, default: null},
    path: {type: String},
  },
  {timestamps: true, versionKey: false}
);
const Folder = model('Folder', folderSchema, 'folders');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(compression());

// Minimal request logger (avoid noisy headers)
app.use((req, res, next) => {
  if (req.path !== '/healthz') {
    console.log(`[FolderService] ${req.method} ${req.url}`);
  }
  next();
});

// Health & debug
app.get('/healthz', (req, res) => {
  res.json({status: 'ok'});
});
app.get('/debug', (req, res) => {
  res.json({status: 'debug_ok', port: process.env.PORT, t: Date.now()});
});
// Root health for platforms that probe '/'
app.get('/', (req, res) => res.json({status: 'ok'}));

// Reads
app.get('/folders', async (req, res) => {
  const {page = 1, limit = 10, name, description, parentId} = req.query;
  const q = {};
  if (name) q.name = new RegExp(name, 'i');
  if (description) q.description = new RegExp(description, 'i');
  if (Object.prototype.hasOwnProperty.call(req.query, 'parentId')) q.parentId = parentId;
  const docs = await Folder.find(q)
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  res.json({status: true, results: docs});
});

app.get('/folders/:folderId', async (req, res) => {
  const doc = await Folder.findById(req.params.folderId);
  if (!doc) return res.status(httpStatus.NOT_FOUND).json({status: false, message: 'Folder not found'});
  res.json({status: true, ...(doc.toObject ? doc.toObject() : doc)});
});

app.get('/folders/count', async (req, res) => {
  const count = await Folder.countDocuments();
  res.json({status: true, count});
});

app.get('/folders/tree', async (req, res) => {
  const folders = await Folder.find().select('_id name parentId path');
  res.json({status: true, results: folders});
});

app.get('/folders/root/contents', async (req, res) => {
  const results = await Folder.find({parentId: null});
  res.json({status: true, results});
});

const PORT = process.env.PORT || 3001;
const MONGODB_URL = process.env.MONGODB_URL;

// Start server first
app.listen(PORT, '0.0.0.0', () => console.log(`Folder service listening on ${PORT}`));

// Connect to Mongo with simple retry (non-blocking)
(async function connectWithRetry(retries = 5) {
  try {
    console.log('[FolderService] Connecting to Mongo…');
    await mongoose.connect(MONGODB_URL, {useNewUrlParser: true, useUnifiedTopology: true});
    console.log('[FolderService] Mongo connected');
  } catch (err) {
    console.error('[FolderService] Mongo connect error', err?.message);
    if (retries > 0) {
      setTimeout(() => connectWithRetry(retries - 1), 2000);
    }
  }
})();
