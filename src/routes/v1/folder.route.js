const express = require('express');
const validate = require('../../middlewares/validate');
const folderValidation = require('../../validations/folder.validation');
const folderController = require('../../controllers/folder.controller');

const router = express.Router();

router
  .route('/')
  .post(validate(folderValidation.createFolder), folderController.createFolder)
  .get(folderController.getFolders);

// Specific routes must be declared before generic parameterized routes
router.get('/tree', folderController.getFolderTree);
router.get('/count', folderController.getTotalFolders); // New route for total folders count

router
  .route('/:folderId')
  .get(validate(folderValidation.getFolder), folderController.getFolder)
  .patch(validate(folderValidation.updateFolder), folderController.updateFolder)
  .delete(validate(folderValidation.deleteFolder), folderController.deleteFolder);

router.get('/:folderId/contents', validate(folderValidation.getFolder), folderController.getFolderContents);
router.get('/:folderId/breadcrumb', validate(folderValidation.getFolder), folderController.getFolderBreadcrumb);
router.get('/:folderId/filtered', validate(folderValidation.getFolder), folderController.getFilteredFolderContents);

// New routes for direct child counts
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
