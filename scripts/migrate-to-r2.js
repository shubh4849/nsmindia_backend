#!/usr/bin/env node

const https = require('https');
const {URL} = require('url');
const mongoose = require('mongoose');
const {S3Client, HeadObjectCommand, PutObjectCommand} = require('@aws-sdk/client-s3');
const config = require('../src/config/config');
const {File} = require('../src/models');
const {resolveExtension, buildPublicUrlFromBase} = require('../src/utils/cloudinary');

const s3 = new S3Client({
  region: config.r2.region,
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
  forcePathStyle: config.r2.forcePathStyle,
});

function httpGetBuffer(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      method: 'GET',
      headers: {
        'User-Agent': 'nsm-backend-migrator/1.0',
      },
    };
    https
      .get(url, options, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow one redirect
          return resolve(httpGetBuffer(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`GET ${urlStr} failed with status ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function headR2(key) {
  try {
    await s3.send(new HeadObjectCommand({Bucket: config.r2.bucket, Key: key}));
    return true;
  } catch (e) {
    return false;
  }
}

async function putR2({key, buffer, contentType}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

async function run() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB');

  const cursor = File.find(
    {},
    {
      _id: 1,
      filePath: 1,
      publicViewUrl: 1,
      publicId: 1,
      key: 1,
      mimeType: 1,
      originalName: 1,
      format: 1,
    }
  ).cursor();

  let processed = 0;
  let skipped = 0;
  let uploaded = 0;
  for await (const doc of cursor) {
    processed += 1;
    const ext = resolveExtension({format: doc.format, mimeType: doc.mimeType, originalName: doc.originalName});
    const baseKey = doc.key || doc.publicId;
    if (!baseKey) {
      skipped += 1;
      if (processed % 100 === 0) console.log(`Processed ${processed} (skipped ${skipped}, uploaded ${uploaded})`);
      continue;
    }

    const hasExt = /\.[A-Za-z0-9]+$/.test(baseKey);
    const key = hasExt ? baseKey : ext ? `${baseKey}.${ext}` : baseKey;

    const exists = await headR2(key);
    if (!exists) {
      const sourceUrl = doc.filePath || doc.publicViewUrl;
      if (!sourceUrl) {
        skipped += 1;
        continue;
      }
      try {
        const buffer = await httpGetBuffer(sourceUrl);
        await putR2({key, buffer, contentType: doc.mimeType});
        uploaded += 1;
      } catch (e) {
        console.warn(`Upload failed for ${doc._id} (${key}):`, e.message);
        continue;
      }
    }

    const r2PublicViewUrl = buildPublicUrlFromBase({baseUrl: config.r2.publicBaseUrl, key});
    const r2FilePath = r2PublicViewUrl;

    await File.updateOne(
      {_id: doc._id},
      {$set: {publicViewUrl: r2PublicViewUrl, filePath: r2FilePath, key, publicId: key, format: ext || doc.format}}
    );

    if (processed % 100 === 0) console.log(`Processed ${processed} (skipped ${skipped}, uploaded ${uploaded})`);
  }

  console.log(`Done. Processed ${processed}, newly uploaded ${uploaded}, skipped ${skipped}.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
