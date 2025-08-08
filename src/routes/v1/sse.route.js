const express = require('express');
const sseController = require('../../controllers/sse.controller');

const router = express.Router();

router.get('/upload-progress/:uploadId', sseController.getUploadProgress);
router.get('/folder-updates/:folderId', sseController.getFolderUpdates);

module.exports = router;
