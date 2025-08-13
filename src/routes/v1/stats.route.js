const express = require('express');
const {getCounts} = require('../../controllers/stats.controller');

const router = express.Router();

router.get('/counts', getCounts);

module.exports = router;
