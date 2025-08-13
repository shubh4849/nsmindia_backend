const {pollOnce, ack} = require('../utils/sqs');
const config = require('../config/config');

let running = false;

async function handleMessage(body) {
  const {event, fileId, ...rest} = body || {};
  console.log('[FileEvent]', event, {fileId, ...rest});
}

async function loop() {
  running = true;
  const queueUrl = config.aws.sqs.fileEventsUrl;
  while (running) {
    try {
      const messages = await pollOnce(queueUrl, {max: 10, wait: 20, visibility: 60});
      for (const m of messages) {
        try {
          const body = JSON.parse(m.Body || '{}');
          await handleMessage(body);
          await ack(queueUrl, m.ReceiptHandle);
        } catch (e) {
          // leave for retry / DLQ
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function start() {
  if (!running) loop();
}

function stop() {
  running = false;
}

module.exports = {start, stop};
