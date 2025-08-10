const cloudinary = require('cloudinary').v2;
const config = require('../config/config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

function sanitizeBaseName(name) {
  const base = name.replace(/\.[^/.]+$/, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Upload a file to Cloudinary with a stable public_id from Buffer
 * @param {Object} args
 * @param {Buffer} args.fileBuffer - The file buffer to upload
 * @param {string} args.folder - The folder in Cloudinary (e.g., files/<folderId>)
 * @param {string} args.publicId - Public ID base (without extension); will be nested under folder
 * @param {('auto'|'image'|'video'|'raw')} [args.resourceType='auto'] - Cloudinary resource type
 * @returns {Promise<Object>}
 */
const uploadFileToCloudinary = async ({fileBuffer, folder, publicId, resourceType = 'auto'}) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: resourceType,
          folder,
          public_id: publicId,
          use_filename: false,
          unique_filename: false,
          overwrite: true,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      )
      .end(fileBuffer);
  });
};

const uploadStreamToCloudinary = async ({stream, folder, publicId, resourceType = 'auto'}) => {
  return new Promise((resolve, reject) => {
    const cldStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder,
        public_id: publicId,
        use_filename: false,
        unique_filename: false,
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.pipe(cldStream);
  });
};

const deleteFileFromCloudinary = async (publicId, options = {}) => {
  return cloudinary.uploader.destroy(publicId, options);
};

const deleteFolderIfEmpty = async folder => {
  try {
    const res = await cloudinary.api.delete_folder(folder);
    return res;
  } catch (e) {
    console.warn('[Cloudinary] delete_folder failed (likely not empty)', {
      folder,
      error: e?.error || e?.message || e,
    });
    return null;
  }
};

module.exports = {
  sanitizeBaseName,
  uploadFileToCloudinary,
  uploadStreamToCloudinary,
  deleteFileFromCloudinary,
  deleteFolderIfEmpty,
};
