const express = require('express');
const validate = require('../../middlewares/validate');
const folderValidation = require('../../validations/folder.validation');
const folderController = require('../../controllers/folder.controller');
const fetch = require('node-fetch');
const config = require('../../config/config');

const router = express.Router();

async function proxyIfConfigured(req, res, next, pathBuilder) {
  if (!config.services.folderServiceUrl) return next();
  const url = `${config.services.folderServiceUrl}${pathBuilder(req)}`;
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

router
  .route('/')
  .post(validate(folderValidation.createFolder), folderController.createFolder)
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
  .patch(validate(folderValidation.updateFolder), folderController.updateFolder)
  .delete(validate(folderValidation.deleteFolder), folderController.deleteFolder);

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
