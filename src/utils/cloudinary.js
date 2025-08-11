const IMAGE_MIME_PREFIX = 'image/';
const VIDEO_MIME_PREFIX = 'video/';

function mapResourceType(mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith(IMAGE_MIME_PREFIX)) return 'image';
  if (m.startsWith(VIDEO_MIME_PREFIX)) return 'video';

  const RAW_MIME_SET = new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'text/plain',
    'text/csv',
    'application/json',
    'application/xml',
  ]);

  if (RAW_MIME_SET.has(m)) return 'raw';

  if (m === 'application/pdf') return 'image';

  return 'raw';
}

function buildPublicViewUrl({cloudName, resourceType, publicId, format}) {
  const base = `https://res.cloudinary.com/${cloudName}`;
  if (resourceType === 'image') return `${base}/image/upload/${publicId}.${format}`;
  if (resourceType === 'video') return `${base}/video/upload/${publicId}.${format}`;
  return `${base}/raw/upload/${publicId}.${format}`;
}

module.exports = {mapResourceType, buildPublicViewUrl};
