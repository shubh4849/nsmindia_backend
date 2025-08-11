const {S3Client, PutObjectCommand, DeleteObjectCommand} = require('@aws-sdk/client-s3');
const config = require('../config/config');

const s3 = new S3Client({
  region: config.r2.region,
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
  forcePathStyle: config.r2.forcePathStyle,
});

function sanitizeBaseName(name) {
  const base = name.replace(/\.[^/.]+$/, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function uploadFileToR2({buffer, key, contentType, cacheControl}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  );
}

async function uploadStreamToR2({stream, key, contentType, cacheControl}) {
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const buffer = Buffer.concat(chunks);
  await uploadFileToR2({buffer, key, contentType, cacheControl});
}

async function deleteFromR2(key) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
    })
  );
}

function buildPublicUrlFromKey(key) {
  const base = config.r2 && config.r2.publicBaseUrl;
  if (!base) {
    throw new Error('R2_PUBLIC_BASE_URL or R2_PUBLIC_DEVELOPMENT_URL is not configured');
  }
  return `${base.replace(/\/$/, '')}/${key}`;
}

module.exports = {
  sanitizeBaseName,
  uploadFileToStorage: async ({fileBuffer, folder, publicId, resourceType = 'raw', mimeType}) => {
    const key = `${folder}/${publicId}`;
    await uploadFileToR2({
      buffer: fileBuffer,
      key,
      contentType: mimeType || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    return {
      public_id: key,
      secure_url: buildPublicUrlFromKey(key),
      resource_type: resourceType,
      format: undefined,
      type: 'upload',
    };
  },
  uploadStreamToStorage: async ({stream, folder, publicId, resourceType = 'raw', mimeType}) => {
    const key = `${folder}/${publicId}`;
    await uploadStreamToR2({
      stream,
      key,
      contentType: mimeType || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    return {
      public_id: key,
      secure_url: buildPublicUrlFromKey(key),
      resource_type: resourceType,
      format: undefined,
      type: 'upload',
    };
  },
  deleteFileFromStorage: async publicId => {
    await deleteFromR2(publicId);
    return {result: 'ok'};
  },
  deleteFolderIfEmpty: async () => null,
};
