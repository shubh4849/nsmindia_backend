const express = require('express');
const validate = require('../../middlewares/validate');
const fileValidation = require('../../validations/file.validation');
const fileController = require('../../controllers/file.controller');
const multer = require('multer');
const {fileTypes} = require('../../constants');
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (fileTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported'), false);
    }
  },
});
router.post('/upload', upload.single('file'), fileController.uploadFile);

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
