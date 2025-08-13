const express = require('express');
const {SQSClient, ReceiveMessageCommand, DeleteMessageCommand} = require('@aws-sdk/client-sqs');

require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 3003;
const QUEUE_URL = process.env.SQS_PROGRESS_EVENTS_URL;
const REGION = process.env.AWS_REGION;
const ACCESS_KEY_ID = process.env.AWS_SQS_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.AWS_SQS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

if (!QUEUE_URL || !REGION) {
  console.error('Missing required env: SQS_PROGRESS_EVENTS_URL or AWS_REGION');
  process.exit(1);
}

const sqs = new SQSClient({
  region: REGION,
  credentials:
    ACCESS_KEY_ID && SECRET_ACCESS_KEY ? {accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY} : undefined,
});

// In-memory subscriber registry
const subs = new Map(); // uploadId -> Set(res)

// Minimal request logger
app.use((req, res, next) => {
  if (req.path !== '/healthz') console.log(`[SSE Service] ${req.method} ${req.url}`);
  next();
});

function subscribe(uploadId, res) {
  if (!subs.has(uploadId)) subs.set(uploadId, new Set());
  const set = subs.get(uploadId);
  set.add(res);
  console.log('[SSE Service] subscribed', {uploadId, totalSubs: set.size});
  return () => {
    try {
      set.delete(res);
      console.log('[SSE Service] unsubscribed', {uploadId, remaining: set.size});
      if (set.size === 0) subs.delete(uploadId);
    } catch {}
  };
}

function emit(uploadId, event) {
  const set = subs.get(uploadId);
  if (!set || set.size === 0) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const isTerminal =
    event?.status === 'completed' ||
    event?.status === 'failed' ||
    event?.event === 'UPLOAD_COMPLETED' ||
    event?.event === 'UPLOAD_FAILED';
  let sent = 0;
  for (const res of Array.from(set)) {
    try {
      res.write(data);
      sent++;
      if (isTerminal) {
        try {
          res.end();
        } catch {}
        set.delete(res);
      }
    } catch {}
  }
  if (isTerminal && set.size === 0) subs.delete(uploadId);
  console.log('[SSE Service] emit', {uploadId, event: event?.event || event?.status, sent, remaining: set.size});
}

async function pollLoop() {
  console.log('[SSE Service] poll loop start', {queue: QUEUE_URL, region: REGION});
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const resp = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 60,
        })
      );
      const messages = resp.Messages || [];
      if (messages.length) console.log('[SSE Service] received messages', {count: messages.length});
      for (const m of messages) {
        try {
          const body = JSON.parse(m.Body || '{}');
          if (body.uploadId) emit(body.uploadId, body);
          await sqs.send(new DeleteMessageCommand({QueueUrl: QUEUE_URL, ReceiptHandle: m.ReceiptHandle}));
        } catch (e) {
          console.warn('[SSE Service] handle message failed', {err: e?.message});
        }
      }
    } catch (e) {
      console.warn('[SSE Service] poll error', {err: e?.message});
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

app.get('/events/upload/:uploadId', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  const {uploadId} = req.params;
  console.log('[SSE Service] client connected', {uploadId});
  const unsubscribe = subscribe(uploadId, res);
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({uploadId, status: 'uploading', progress: 0})}\n\n`);
  req.on('close', () => {
    unsubscribe();
    try {
      res.end();
    } catch {}
  });
});

app.get('/healthz', (req, res) => res.json({status: 'ok'}));
app.get('/debug', (req, res) => res.json({status: 'debug_ok', port: PORT, t: Date.now()}));
app.get('/', (req, res) => res.json({status: 'ok'}));

// Start server first, then begin polling
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SSE service listening on ${PORT}`);
  pollLoop();
});
