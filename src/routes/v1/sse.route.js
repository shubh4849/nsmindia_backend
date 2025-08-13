const express = require('express');
const sseController = require('../../controllers/sse.controller');
const fetch = require('node-fetch');
const config = require('../../config/config');

const router = express.Router();

router.get('/upload-progress/:uploadId', (req, res) => {
  const uploadId = req.params.uploadId;
  const url = `${config.sse.baseUrl}/events/upload/${encodeURIComponent(uploadId)}`;
  console.log('[SSE Proxy] start', {uploadId, url});
  fetch(url, {headers: {Accept: 'text/event-stream'}})
    .then(upstream => {
      console.log('[SSE Proxy] upstream connected', {status: upstream.status, ok: upstream.ok});
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      });
      let bytes = 0;
      upstream.body.on('data', chunk => {
        bytes += chunk.length;
        // log first chunk only to avoid noisy logs
        if (bytes === chunk.length) {
          console.log('[SSE Proxy] first chunk from upstream', {uploadId, bytes});
        }
      });
      upstream.body.pipe(res);
      upstream.body.on('error', err => {
        console.log('[SSE Proxy] upstream error', {uploadId, err: err?.message});
        try {
          res.end();
        } catch {}
      });
      upstream.body.on('end', () => {
        console.log('[SSE Proxy] upstream end', {uploadId, bytes});
      });
      req.on('close', () => {
        console.log('[SSE Proxy] client closed', {uploadId, bytes});
        try {
          upstream.body.destroy();
        } catch {}
        try {
          res.end();
        } catch {}
      });
    })
    .catch(err => {
      console.log('[SSE Proxy] fetch failed', {uploadId, err: err?.message});
      try {
        res.status(502).end();
      } catch {}
    });
});

router.get('/folder-updates/:folderId', sseController.getFolderUpdates);

module.exports = router;
