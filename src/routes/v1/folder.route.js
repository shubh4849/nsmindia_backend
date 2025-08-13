const express = require('express');
const validate = require('../../middlewares/validate');
const folderValidation = require('../../validations/folder.validation');
const folderController = require('../../controllers/folder.controller');
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
  if (!config.services.folderServiceUrl) return next();
  const path = pathBuilder(req);
  const url = `${config.services.folderServiceUrl}${path}` + (req._parsedUrl.search || '');
  const method = init.method || req.method;
  const startedAt = Date.now();
  const rid = `${startedAt}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  try {
    console.log(`🛰️  [FolderProxy:${rid}] prepare`, {method, url, path, search: req._parsedUrl.search || ''});
    const upstream = await fetch(url, {
      method,
      headers: init.headers || {'Content-Type': 'application/json'},
      body: init.body || (method !== 'GET' && method !== 'HEAD' ? JSON.stringify(req.body || {}) : undefined),
      agent: getAgent(url),
    });
    const elapsedMs = Date.now() - startedAt;
    console.log(`✅ [FolderProxy:${rid}] upstream`, {status: upstream.status, ok: upstream.ok, elapsedMs});
    // If upstream failed (>=400), fallback to local (log body snippet for diagnostics)
    if (!upstream.ok) {
      let snippet = '';
      try {
        const text = await upstream.text();
        snippet = text ? text.substring(0, 600) : '';
      } catch (e) {
        snippet = `<<failed to read body: ${e?.message}>>`;
      }
      console.log(`↩️  [FolderProxy:${rid}] non-OK; falling back`, {
        status: upstream.status,
        elapsedMs,
        bodySnippet: snippet,
      });
      return next();
    }
    const ct = upstream.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.status(upstream.status);
    if (upstream.body) {
      upstream.body.pipe(res);
      upstream.body.on('error', err => {
        console.log(`⚠️  [FolderProxy:${rid}] stream error`, {url, err: err?.message});
        try {
          res.end();
        } catch {}
      });
    } else {
      res.end();
    }
  } catch (e) {
    const elapsedMs = Date.now() - startedAt;
    console.log(`💥 [FolderProxy:${rid}] error; falling back`, {err: e?.message, elapsedMs, url});
    next();
  }
}

router
  .route('/')
  .post(
    (req, res, next) => proxyIfConfigured(req, res, next, () => '/folders'),
    validate(folderValidation.createFolder),
    folderController.createFolder
  )
  .get((req, res, next) => proxyIfConfigured(req, res, next, () => '/folders'), folderController.getFolders);

router.get(
  '/tree',
  (req, res, next) => proxyIfConfigured(req, res, next, () => '/folders/tree'),
  folderController.getFolderTree
);
router.get(
  '/root/contents',
  (req, res, next) => proxyIfConfigured(req, res, next, () => '/folders/root/contents'),
  folderController.getRootContents
);
router.get(
  '/search',
  (req, res, next) => proxyIfConfigured(req, res, next, () => '/folders/search'),
  folderController.unifiedSearch
);
router.get(
  '/count',
  (req, res, next) => proxyIfConfigured(req, res, next, () => '/folders/count'),
  folderController.getTotalFolders
);

router
  .route('/:folderId')
  .get(
    (req, res, next) => proxyIfConfigured(req, res, next, r => `/folders/${r.params.folderId}`),
    validate(folderValidation.getFolder),
    folderController.getFolder
  )
  .patch(
    (req, res, next) => proxyIfConfigured(req, res, next, r => `/folders/${r.params.folderId}`),
    validate(folderValidation.updateFolder),
    folderController.updateFolder
  )
  .delete(
    (req, res, next) => proxyIfConfigured(req, res, next, r => `/folders/${r.params.folderId}`),
    validate(folderValidation.deleteFolder),
    folderController.deleteFolder
  );

router.get(
  '/:folderId/contents',
  (req, res, next) => proxyIfConfigured(req, res, next, r => `/folders/${r.params.folderId}/contents`),
  validate(folderValidation.getFolder),
  folderController.getFolderContents
);
router.get(
  '/:folderId/breadcrumb',
  (req, res, next) => proxyIfConfigured(req, res, next, r => `/folders/${r.params.folderId}/breadcrumb`),
  validate(folderValidation.getFolder),
  folderController.getFolderBreadcrumb
);
router.get(
  '/:folderId/filtered',
  (req, res, next) => proxyIfConfigured(req, res, next, r => `/folders/${r.params.folderId}/filtered`),
  validate(folderValidation.getFolder),
  folderController.getFilteredFolderContents
);

router.get(
  '/:folderId/child-folders/count',
  validate(folderValidation.getFolder),
  folderController.getDirectChildFoldersCount
);
router.get(
  '/:folderId/child-files/count',
  validate(folderValidation.getFolder),
  folderController.getDirectChildFilesCount
);

module.exports = router;
