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

const MIME_EXTENSION_MAP = {
  // Office (OOXML)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  // Legacy Office
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  // ODF
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  // Text-ish
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/xml': 'xml',
  // Images (in case format missing)
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  // Videos
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
};

function getExtensionFromName(name) {
  if (!name || typeof name !== 'string') return '';
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  return name.substring(idx + 1).toLowerCase();
}

function resolveExtension({format, mimeType, originalName}) {
  if (format && typeof format === 'string' && format.trim()) return format.toLowerCase();
  const byName = getExtensionFromName(originalName);
  if (byName) return byName;
  const m = (mimeType || '').toLowerCase();
  return MIME_EXTENSION_MAP[m] || '';
}

function buildPublicViewUrl({cloudName, resourceType, publicId, extension}) {
  const base = `https://res.cloudinary.com/${cloudName}`;
  const path = resourceType === 'image' ? 'image/upload' : resourceType === 'video' ? 'video/upload' : 'raw/upload';
  const suffix = extension && extension.trim() ? `.${extension}` : '';
  return `${base}/${path}/${publicId}${suffix}`;
}

module.exports = {mapResourceType, buildPublicViewUrl, resolveExtension};
