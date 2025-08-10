const express = require('express');
const validate = require('../../middlewares/validate');
const fileValidation = require('../../validations/file.validation');
const fileController = require('../../controllers/file.controller');
const router = express.Router();

// Init upload session
router.post('/upload/init', fileController.initUpload);

// Streaming upload (multipart/form-data) with Busboy in controller
router.post('/upload', fileController.uploadFile);

router.route('/').get(fileController.getFiles);

// Specific routes must be declared before generic parameterized routes
router.get('/search', fileController.searchFiles);
router.get('/count', fileController.getTotalFiles); // New route for total files count

router
  .route('/:fileId')
  .get(validate(fileValidation.getFile), fileController.getFile)
  .patch(validate(fileValidation.updateFile), fileController.updateFile)
  .delete(validate(fileValidation.deleteFile), fileController.deleteFile);

router.get('/:fileId/download', validate(fileValidation.getFile), fileController.downloadFile);
router.get('/:fileId/preview', validate(fileValidation.getFile), fileController.previewFile);

module.exports = router;
