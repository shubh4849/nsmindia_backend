const express = require('express');
const validate = require('../../middlewares/validate');
const folderValidation = require('../../validations/folder.validation');
const folderController = require('../../controllers/folder.controller');
const {folderService, fileService} = require('../../services');
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

async function captureControllerResult(handler, req) {
  return new Promise(resolve => {
    const cap = {statusCode: 200, body: null};
    const res = {
      status(code) {
        cap.statusCode = code;
        return this;
      },
      json(data) {
        cap.body = data;
        resolve(cap);
      },
      send(data) {
        try {
          cap.body = typeof data === 'string' ? JSON.parse(data) : data;
        } catch {
          cap.body = data;
        }
        resolve(cap);
      },
      end() {
        resolve(cap);
      },
      set() {
        return this;
      },
    };
    try {
      handler(req, res, () => resolve(cap));
    } catch {
      resolve(cap);
    }
  });
}

async function proxyIfConfigured(req, res, next, pathBuilder, init = {}, diagnoseLabel) {
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
    // Response normalization for microservice responses: tree, list, contents
    if (upstream.ok) {
      const isTree = path === '/folders/tree';
      const isList = path === '/folders';
      const isRootContents = path === '/folders/root/contents';
      const contentsMatch = path.match(/^\/folders\/([^/]+)\/contents$/);
      if (isTree || isList || isRootContents || contentsMatch) {
        try {
          const text = await upstream.text();
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          // no-op: removed DIFF logs
          // Normalize micro response to monolithic shape
          let normalized = parsed;
          if (isTree && parsed && typeof parsed === 'object' && Array.isArray(parsed.results)) {
            const tree = folderService.buildTree(parsed.results);
            normalized = {status: true, results: tree};
          } else if (isList && parsed && typeof parsed === 'object') {
            const wantsCounts = req.query.includeChildCounts === 'true' || req.query.includeChildCounts === true;
            const results = Array.isArray(parsed.results) ? parsed.results : [];
            if (wantsCounts && results.length > 0) {
              const enriched = await Promise.all(
                results.map(async f => {
                  const id = (f && (f._id || f.id)) || null;
                  if (!id) return f;
                  const [childFolders, childFiles] = await Promise.all([
                    folderService.countChildFolders(id),
                    fileService.countChildFiles(id),
                  ]);
                  return {...f, counts: {childFolders, childFiles}};
                })
              );
              normalized = {status: true, results: enriched};
            } else if (!('status' in (parsed || {}))) {
              normalized = {status: true, ...parsed};
            }
          } else if ((isRootContents || contentsMatch) && parsed && typeof parsed === 'object') {
            const page = parseInt(req.query.page || '1');
            const limit = parseInt(req.query.limit || '10');
            const {name, description, dateFrom, dateTo} = req.query;
            const folders = Array.isArray(parsed.results)
              ? parsed.results
              : Array.isArray(parsed.folders)
              ? parsed.folders
              : [];

            // Fetch files like monolith does
            let filesPage = {results: [], totalResults: 0, totalPages: 0};
            if (isRootContents) {
              filesPage = await fileService.getFilteredFiles(
                {folderId: null, name, description, dateFrom, dateTo},
                {page, limit}
              );
            } else if (contentsMatch) {
              const folderId = contentsMatch[1];
              filesPage = await fileService.getFilesByFolderId(
                folderId,
                {name, description, dateFrom, dateTo},
                {page, limit}
              );
            }

            let files = filesPage.results || [];
            const totalFiles = filesPage.totalResults || 0;
            const totalPagesFiles = filesPage.totalPages || Math.ceil(totalFiles / Math.max(1, limit));
            let totalFolders = folders.length;
            const pagination = {
              page,
              limit,
              totalFolders,
              totalFiles,
              totalPagesFolders: Math.ceil(totalFolders / Math.max(1, limit)),
              totalPagesFiles,
            };

            // Optionally enrich with direct child counts when requested
            const wantsCounts = req.query.includeChildCounts === 'true' || req.query.includeChildCounts === true;
            if (wantsCounts && Array.isArray(folders) && folders.length > 0) {
              const enriched = await Promise.all(
                folders.map(async f => {
                  const id = (f && (f._id || f.id)) || null;
                  if (!id) return f;
                  const [childFolders, childFiles] = await Promise.all([
                    folderService.countChildFolders(id),
                    fileService.countChildFiles(id),
                  ]);
                  return {...f, counts: {childFolders, childFiles}};
                })
              );
              totalFolders = enriched.length;
              normalized = {status: true, folders: enriched, files, pagination: {...pagination, totalFolders}};
            } else {
              normalized = {status: true, folders, files, pagination};
            }
          }
          res.set('Content-Type', 'application/json');
          return res
            .status(upstream.status)
            .send(typeof normalized === 'string' ? normalized : JSON.stringify(normalized));
        } catch (e) {
          // If logging/parsing fails, fall back to normal flow
        }
      }
    }
    // Diagnostics: compare upstream vs local when requested
    if (process.env.DIAG_FOLDER_PROXY === 'true' && diagnoseLabel && upstream.ok) {
      try {
        const text = await upstream.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
        const localCap = await captureControllerResult(diagnoseLabel, req);
        const upstreamSnippet =
          typeof parsed === 'string' ? parsed.substring(0, 1200) : JSON.stringify(parsed).substring(0, 1200);
        const localSnippet = localCap.body ? JSON.stringify(localCap.body).substring(0, 1200) : '';
        console.log(`🔬 [FolderDiag:${rid}] compare`, {
          path,
          upstreamType: typeof parsed,
          upstreamKeys: parsed && parsed.results ? Object.keys(parsed.results[0] || {}) : undefined,
          upstreamBody: upstreamSnippet,
          localStatus: localCap.statusCode,
          localType: typeof localCap.body,
          localKeys: localCap.body && localCap.body.results ? Object.keys(localCap.body.results[0] || {}) : undefined,
          localBody: localSnippet,
        });
        const ct = upstream.headers.get('content-type');
        if (ct) res.set('Content-Type', ct);
        return res.status(upstream.status).send(typeof parsed === 'string' ? text : JSON.stringify(parsed));
      } catch (e) {
        console.log(`🔬 [FolderDiag:${rid}] compare failed`, {err: e?.message});
        // fall through to normal flow
      }
    }
    // If upstream failed (>=400), fallback to local (log body snippet for diagnostics)
    if (!upstream.ok) {
      let upstreamSnippet = '';
      try {
        const text = await upstream.text();
        upstreamSnippet = text ? text.substring(0, 600) : '';
      } catch (e) {
        upstreamSnippet = `<<failed to read body: ${e?.message}>>`;
      }
      if (process.env.DIAG_FOLDER_PROXY === 'true' && diagnoseLabel) {
        const localCap = await captureControllerResult(diagnoseLabel, req);
        const localSnippet = localCap.body ? JSON.stringify(localCap.body).substring(0, 1200) : '';
        console.log(`↩️  [FolderProxy:${rid}] non-OK; sending local`, {
          status: upstream.status,
          elapsedMs,
          upstreamBody: upstreamSnippet,
          localStatus: localCap.statusCode,
          localBody: localSnippet,
        });
        res.status(localCap.statusCode || 200).json(localCap.body);
        return;
      }
      console.log(`↩️  [FolderProxy:${rid}] non-OK; falling back`, {
        status: upstream.status,
        elapsedMs,
        bodySnippet: upstreamSnippet,
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
  (req, res, next) => proxyIfConfigured(req, res, next, () => '/folders/tree', {}, folderController.getFolderTree),
  folderController.getFolderTree
);
router.get(
  '/root/contents',
  (req, res, next) =>
    proxyIfConfigured(req, res, next, () => '/folders/root/contents', {}, folderController.getFolderContents),
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
