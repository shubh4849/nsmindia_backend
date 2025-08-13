# NSM India Backend – Microservices-ready Node/Express

This repository contains a production-grade Express backend that has been migrated from a monolith into a
microservices-ready architecture. It includes:

- An API Gateway (the original monolith), still hosting write flows and proxying reads/writes to services
- A standalone SSE service for real-time upload progress via AWS SQS
- Read services for Folders and Files, ready to take over writes when needed

The goal is to deliver a clear separation of concerns while keeping developer experience strong during the transition.

## High-level Architecture

- Monolith (API Gateway)

  - Exposes `/v1/...` routes
  - Hosts file upload pipeline (Cloudflare R2), validation, and fallbacks
  - Publishes events to SQS: file, folder, progress
  - Proxies requests to microservices when configured
  - Falls back to local handlers if upstream is unavailable

- SSE Service

  - Consumes `progress-events-queue` from SQS
  - Streams events to clients via Server-Sent Events
  - Monolith proxies `/v1/sse/upload-progress/:uploadId` to SSE service (or falls back to DB polling)

- Folder Service (read endpoints)

  - Read operations for folders (list, get, tree, counts)
  - Accessible directly and via monolith proxy

- File Service (read endpoints)
  - Read operations for files (list, get, search, counts)
  - Accessible directly and via monolith proxy

## Repository Layout

```
src/
  app.js                 # Express app setup (security, compression, CORS, routing)
  index.js               # Server bootstrap, Mongo connect, background consumers

  config/
    config.js            # Central env validation (Joi), typed config object
    logger.js, morgan.js # Logging and HTTP logging

  constants/             # Global constants (e.g., file types)
  controllers/           # Request handlers (validation, orchestration)
  middlewares/           # validate/error handling
  models/                # Mongoose models (file.model.js, folder.model.js, uploadprogress.model.js)
  routes/v1/             # Versioned routes
    file.route.js        # Upload + CRUD + proxy hooks
    folder.route.js      # Folder CRUD + proxy hooks
    sse.route.js         # SSE proxy with fallback to DB polling
  services/              # Business and persistence logic
    file.service.js      # File CRUD + R2 integration + SQS file events
    folder.service.js    # Folder CRUD + SQS folder events
    progress.service.js  # Upload progress persistence and throttle helper
    sse.service.js       # Mongo change streams + upload subscribers (monolith fallback)
  microservices/
    fileUpload.service.js# Cloudflare R2 (S3-compatible) storage helpers
  utils/
    sqs.js               # AWS SQS publish/poll/ack helpers
    storage.js           # Type/extension helpers
  validations/           # Joi schemas for API inputs
  events/schemas.js      # Joi schemas for file/folder/progress events

services/
  sse/                   # Standalone SSE service
    package.json
    src/index.js         # Binds to PORT, polls SQS, SSE endpoint `/events/upload/:uploadId`
  folder/                # Folder read service
    package.json
    src/index.js         # Binds to PORT, connects Mongo, `/folders`, `/healthz`
  file/                  # File read service
    package.json
    src/index.js         # Binds to PORT, connects Mongo, `/files`, `/healthz`
```

## Data Flow

- Upload

  - Client: `POST /v1/files/upload/init` → returns `uploadId`
  - Client: `POST /v1/files/upload` (multipart) with `uploadId`
  - Monolith streams to R2 and writes progress to Mongo and SQS `progress-events-queue`
  - SSE Service consumes SQS and pushes events to clients via `/events/upload/:uploadId`
  - Monolith proxies `/v1/sse/upload-progress/:uploadId` to SSE service; falls back to DB polling if needed

- Folder

  - Monolith performs CRUD, publishes SQS folder events
  - Read endpoints may be proxied to Folder service if `FOLDER_SERVICE_URL` is set

- File
  - Monolith performs CRUD (delete uses R2 delete), publishes SQS file events
  - Read endpoints may be proxied to File service if `FILE_SERVICE_URL` is set

## Proxy Strategy (API Gateway)

Monolith supports optional proxying to services:

- Set `SSE_SERVICE_URL` to stream via SSE service
- Set `FOLDER_SERVICE_URL`, `FILE_SERVICE_URL` to forward reads/writes
- If upstream is down or returns non-OK (e.g., 502), monolith falls back to local handlers
- Loud logs with emojis indicate proxy path and outcomes

Examples:

- `🔁 [FolderProxy] → GET http://jubilant-simplicity.railway.internal/folders/count`
- `✅ [FolderProxy] ← … status: 200`
- `↩️ [FolderProxy] Fallback to local due to error: …`

## Environment Variables

Monolith (API Gateway)

- `NODE_ENV`, `PORT`
- `MONGODB_URL`
- Cloudflare R2:
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  - `R2_PUBLIC_DEVELOPMENT_URL`, `R2_FORCE_PATH_STYLE`, `R2_REGION`
- SQS:
  - `AWS_REGION`, `AWS_SQS_ACCESS_KEY`, `AWS_SQS_SECRET_ACCESS_KEY`
  - `SQS_FOLDER_EVENTS_URL`, `SQS_FILE_EVENTS_URL`, `SQS_PROGRESS_EVENTS_URL`
- Proxies:
  - `SSE_SERVICE_URL` (e.g., `http://sse-service.railway.internal`)
  - `SQS_PROGRESS_CONSUMER_ENABLED` (default false; set true only if monolith should consume progress itself)
  - `FOLDER_SERVICE_URL`, `FILE_SERVICE_URL` (internal or public base URLs, no trailing slash)

SSE Service

- `PORT` (injected by platform)
- `AWS_REGION`, `AWS_SQS_ACCESS_KEY`, `AWS_SQS_SECRET_ACCESS_KEY`
- `SQS_PROGRESS_EVENTS_URL`

Folder Service

- `PORT` (injected by platform)
- `MONGODB_URL`

File Service

- `PORT` (injected by platform)
- `MONGODB_URL`

## Observability & Alarms

- `/healthz` on SSE/Folder/File services; gateway responds normally
- Add CloudWatch alarms on DLQs:
  - Metric: `ApproximateNumberOfMessagesVisible` for each `*-dlq`
  - Condition: `> 0` for 5 minutes
  - Action: SNS email/Slack

## Local Development

- Run monolith: `npm run dev`
- Run SSE locally: `npm run sse:dev` (set AWS env and queue URL)
- Use internal proxies only in cloud; locally, use `http://localhost:3003` for SSE

## Notes

- Model files follow `name.model.js` naming and are exported via `models/index.js`
- Services contain business logic; controllers handle validation and orchestration
- Proxy fallbacks ensure resilience during service rollouts

_Codebase should be like a garden where everyone can move around easily and peacefully._

**Happy shipping.**
