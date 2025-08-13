const express = require('express');
const validate = require('../../middlewares/validate');
const fileValidation = require('../../validations/file.validation');
const fileController = require('../../controllers/file.controller');
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const config = require('../../config/config');
const router = express.Router();

function getAgent(url) {
  return url.startsWith('https')
    ? new https.Agent({keepAlive: true, family: 4})
    : new http.Agent({keepAlive: true, family: 4});
}

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
      agent: getAgent(url),
    });
    console.log('✅ [FileProxy] ←', method, url, 'status:', upstream.status);
    if (upstream.ok) {
      const isList = path === '/files';
      const isSearch = path === '/files/search';
      const isCount = path === '/files/count';
      const getMatch = path.match(/^\/files\/([^/]+)$/);
      if (isList || isSearch || isCount || getMatch) {
        try {
          const text = await upstream.text();
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          // no-op: removed DIFF logs

          // Normalization: ensure {status: true, ...}
          let normalized = parsed;
          if (parsed && typeof parsed === 'object') {
            if (isList || isSearch) {
              if (!('status' in parsed)) normalized = {status: true, ...parsed};
            } else if (isCount) {
              const count = parsed.count ?? parsed.total ?? 0;
              normalized = {status: true, count};
            } else if (getMatch) {
              const body = parsed.results ? parsed.results[0] : parsed;
              normalized = {status: true, ...(body || {})};
            }
          }

          res.set('Content-Type', 'application/json');
          return res
            .status(upstream.status)
            .send(typeof normalized === 'string' ? normalized : JSON.stringify(normalized));
        } catch (e) {
          // fall back to normal flow
        }
      }
    }
    if (!upstream.ok) {
      console.log('↩️  [FileProxy] Upstream non-OK, falling back to local for', method, url);
      return next();
    }
    const ct = upstream.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
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
