const express = require('express');
const router = express.Router();

const folderRoute = require('./folder.route');
const fileRoute = require('./file.route');
const sseRoute = require('./sse.route');
const statsRoute = require('./stats.route');

router.use('/folders', folderRoute);
router.use('/files', fileRoute);
router.use('/sse', sseRoute);
router.use('/stats', statsRoute);

module.exports = router;
