const Joi = require('joi');
const path = require('path');
const dotnev = require('dotenv');

dotnev.config({path: path.join(__dirname, '../../.env')});

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid('test', 'development', 'production')
      .required(),
    PORT: Joi.number().default(8082),
    MONGODB_URL: Joi.string().required(),
    // Cloudflare R2
    R2_ACCOUNT_ID: Joi.string().required(),
    R2_ACCESS_KEY_ID: Joi.string().required(),
    R2_SECRET_ACCESS_KEY: Joi.string().required(),
    R2_BUCKET: Joi.string().required(),
    R2_PUBLIC_BASE_URL: Joi.string()
      .uri()
      .optional(),
    R2_PUBLIC_DEVELOPMENT_URL: Joi.string()
      .uri()
      .optional(),
    R2_FORCE_PATH_STYLE: Joi.string()
      .valid('true', 'false')
      .default('true'),
    R2_REGION: Joi.string().default('auto'),
    AWS_SQS_ACCESS_KEY: Joi.string().required(),
    AWS_SQS_SECRET_ACCESS_KEY: Joi.string().required(),
    // Messaging: SQS
    AWS_REGION: Joi.string().required(),
    SQS_FOLDER_EVENTS_URL: Joi.string()
      .uri()
      .required(),
    SQS_FILE_EVENTS_URL: Joi.string()
      .uri()
      .required(),
    SQS_PROGRESS_EVENTS_URL: Joi.string()
      .uri()
      .required(),

    // SSE service (external)
    SSE_SERVICE_URL: Joi.string()
      .uri()
      .default('http://localhost:3003'),
    SQS_PROGRESS_CONSUMER_ENABLED: Joi.string()
      .valid('true', 'false')
      .default('false'),

    // Optional external services for proxying
    FILE_SERVICE_URL: Joi.string()
      .uri()
      .optional(),
    FOLDER_SERVICE_URL: Joi.string()
      .uri()
      .optional(),

    // Kafka legacy (unused now, but kept to avoid runtime breaks if present)
    KAFKA_BROKERS: Joi.string().default('localhost:9093'),
    KAFKA_CLIENT_ID: Joi.string().default('nsm-backend'),
    KAFKA_SSL: Joi.string()
      .valid('true', 'false')
      .default('false'),
  })
  .unknown();

const {value: envVars, error} = envVarsSchema.prefs({errors: {label: 'key'}}).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  r2: {
    accountId: envVars.R2_ACCOUNT_ID,
    accessKeyId: envVars.R2_ACCESS_KEY_ID,
    secretAccessKey: envVars.R2_SECRET_ACCESS_KEY,
    bucket: envVars.R2_BUCKET,
    publicBaseUrl: envVars.R2_PUBLIC_DEVELOPMENT_URL,
    forcePathStyle: envVars.R2_FORCE_PATH_STYLE === 'true',
    region: envVars.R2_REGION,
    endpoint: `https://${envVars.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  },
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  aws: {
    region: envVars.AWS_REGION,
    accessKeyId: envVars.AWS_SQS_ACCESS_KEY,
    secretAccessKey: envVars.AWS_SQS_SECRET_ACCESS_KEY,
    sqs: {
      folderEventsUrl: envVars.SQS_FOLDER_EVENTS_URL,
      fileEventsUrl: envVars.SQS_FILE_EVENTS_URL,
      progressEventsUrl: envVars.SQS_PROGRESS_EVENTS_URL,
    },
  },
  sse: {
    baseUrl: envVars.SSE_SERVICE_URL,
    progressConsumerEnabled: envVars.SQS_PROGRESS_CONSUMER_ENABLED === 'true',
  },
  services: {
    fileServiceUrl: envVars.FILE_SERVICE_URL || null,
    folderServiceUrl: envVars.FOLDER_SERVICE_URL || null,
  },
  kafka: {
    brokers: envVars.KAFKA_BROKERS.split(',').map(s => s.trim()),
    clientId: envVars.KAFKA_CLIENT_ID,
    ssl: envVars.KAFKA_SSL === 'true',
  },
};
