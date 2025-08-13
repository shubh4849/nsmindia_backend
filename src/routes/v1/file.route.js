const express = require('express');
const validate = require('../../middlewares/validate');
const fileValidation = require('../../validations/file.validation');
const fileController = require('../../controllers/file.controller');
const fetch = require('node-fetch');
const config = require('../../config/config');
const router = express.Router();

async function proxyIfConfigured(req, res, next, pathBuilder, init = {}) {
  if (!config.services.fileServiceUrl) return next();
  const path = pathBuilder(req);
  const url = `${config.services.fileServiceUrl}${path}` + (req._parsedUrl.search || '');
  const method = init.method || req.method;
  try {
    console.log('🔁 [FileProxy] →', method, url);
    const upstream = await fetch(url, {
      method,
      headers: init.headers || {'Content-Type': 'application/json'},
      body: init.body || (method !== 'GET' && method !== 'HEAD' ? JSON.stringify(req.body || {}) : undefined),
    });
    console.log('✅ [FileProxy] ←', method, url, 'status:', upstream.status);
    res.status(upstream.status);
    if (upstream.body) {
      upstream.body.pipe(res);
      upstream.body.on('error', err => {
        console.log('⚠️  [FileProxy] stream error', {url, err: err?.message});
        try {
          res.end();
        } catch {}
      });
    } else {
      res.end();
    }
  } catch (e) {
    console.log('↩️  [FileProxy] Fallback to local due to error:', e?.message, 'for', method, url);
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
  .patch(
    (req, res, next) => proxyIfConfigured(req, res, next, r => `/files/${r.params.fileId}`),
    validate(fileValidation.updateFile),
    fileController.updateFile
  )
  .delete(
    (req, res, next) => proxyIfConfigured(req, res, next, r => `/files/${r.params.fileId}`),
    validate(fileValidation.deleteFile),
    fileController.deleteFile
  );

router.get('/:fileId/download', validate(fileValidation.getFile), fileController.downloadFile);
router.get('/:fileId/preview', validate(fileValidation.getFile), fileController.previewFile);

module.exports = router;
