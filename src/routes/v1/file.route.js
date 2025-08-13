const express = require('express');
const validate = require('../../middlewares/validate');
const fileValidation = require('../../validations/file.validation');
const fileController = require('../../controllers/file.controller');
const fetch = require('node-fetch');
const config = require('../../config/config');
const router = express.Router();

async function proxyIfConfigured(req, res, next, pathBuilder) {
  if (!config.services.fileServiceUrl) return next();
  const url = `${config.services.fileServiceUrl}${pathBuilder(req)}`;
  try {
    const upstream = await fetch(url + (req._parsedUrl.search || ''), {
      method: req.method,
      headers: {'Content-Type': 'application/json'},
    });
    res.status(upstream.status);
    upstream.body.pipe(res);
  } catch (e) {
    next();
  }
}

router.post('/upload/init', fileController.initUpload);

router.post('/upload', fileController.uploadFile);

router.route('/').get((req, res, next) => proxyIfConfigured(req, res, next, () => '/files'), fileController.getFiles);

router.get(
  '/search',
  (req, res, next) => proxyIfConfigured(req, res, next, () => '/files/search'),
  fileController.searchFiles
);
router.get(
  '/count',
  (req, res, next) => proxyIfConfigured(req, res, next, () => '/files/count'),
  fileController.getTotalFiles
);

router
  .route('/:fileId')
  .get(
    (req, res, next) => proxyIfConfigured(req, res, next, r => `/files/${r.params.fileId}`),
    validate(fileValidation.getFile),
    fileController.getFile
  )
  .patch(validate(fileValidation.updateFile), fileController.updateFile)
  .delete(validate(fileValidation.deleteFile), fileController.deleteFile);

router.get('/:fileId/download', validate(fileValidation.getFile), fileController.downloadFile);
router.get('/:fileId/preview', validate(fileValidation.getFile), fileController.previewFile);

module.exports = router;
