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

// GET list
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

// GET single
app.get('/folders/:folderId', async (req, res) => {
  const doc = await Folder.findById(req.params.folderId);
  if (!doc) return res.status(httpStatus.NOT_FOUND).json({status: false, message: 'Folder not found'});
  res.json({status: true, ...(doc.toObject ? doc.toObject() : doc)});
});

// Additional read endpoints used by monolith
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

app.get('/healthz', (req, res) => res.json({status: 'ok'}));

const PORT = process.env.PORT || 3001;
const MONGODB_URL = process.env.MONGODB_URL;

mongoose
  .connect(MONGODB_URL, {useNewUrlParser: true, useUnifiedTopology: true})
  .then(() => {
    app.listen(PORT, () => console.log(`Folder service listening on ${PORT}`));
  })
  .catch(err => {
    console.error('Mongo connect error', err);
    process.exit(1);
  });
