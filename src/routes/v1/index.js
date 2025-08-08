const express = require('express');
const router = express.Router();

const userRoute = require('./user.route');
const authRoute = require('./auth.route');
const folderRoute = require('./folder.route');
const fileRoute = require('./file.route');
const sseRoute = require('./sse.route');

router.use('/auth', authRoute);
router.use('/users', userRoute);
router.use('/folders', folderRoute);
router.use('/files', fileRoute);
router.use('/sse', sseRoute);

module.exports = router;
