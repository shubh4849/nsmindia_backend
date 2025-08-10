const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];
const VIDEO_TYPES = ['video/mp4'];

const ALL_ALLOWED_FILE_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES, ...VIDEO_TYPES];

module.exports = {
  IMAGE_TYPES,
  DOCUMENT_TYPES,
  VIDEO_TYPES,
  ALL_ALLOWED_FILE_TYPES,
};
