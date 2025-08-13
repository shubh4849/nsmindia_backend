const {SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand} = require('@aws-sdk/client-sqs');
const config = require('../config/config');

const sqs = new SQSClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

async function publish(queueUrl, payload, messageAttributes = undefined) {
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
    MessageAttributes: messageAttributes,
  });
  return sqs.send(command);
}

async function pollOnce(queueUrl, {max = 10, wait = 20, visibility = 60} = {}) {
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: max,
    WaitTimeSeconds: wait,
    VisibilityTimeout: visibility,
  });
  const res = await sqs.send(command);
  return res.Messages || [];
}

async function ack(queueUrl, receiptHandle) {
  const command = new DeleteMessageCommand({QueueUrl: queueUrl, ReceiptHandle: receiptHandle});
  return sqs.send(command);
}

module.exports = {publish, pollOnce, ack};
