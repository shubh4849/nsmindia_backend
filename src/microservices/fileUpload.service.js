const cloudinary = require('cloudinary').v2;
const config = require('../config/config');

// Configure Cloudinary using environment variables
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
          public_id: publicId, // final public_id becomes `${folder}/${publicId}`
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

/**
 * Upload a file to Cloudinary directly from a readable stream
 * @param {Object} args
 * @param {NodeJS.ReadableStream} args.stream - Readable file stream
 * @param {string} args.folder - The folder in Cloudinary (e.g., files/<folderId>)
 * @param {string} args.publicId - Public ID base (without extension)
 * @param {('auto'|'image'|'video'|'raw')} [args.resourceType='auto']
 * @returns {Promise<Object>}
 */
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

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete (may include folder path)
 * @param {Object} options - Additional options e.g., { resource_type: 'raw' | 'image' | 'video', invalidate: true }
 * @returns {Promise<Object>}
 */
const deleteFileFromCloudinary = async (publicId, options = {}) => {
  return cloudinary.uploader.destroy(publicId, options);
};

/**
 * Attempt to delete a Cloudinary folder if it's empty
 * @param {string} folder - e.g., files/<folderId>
 * @returns {Promise<Object|null>} result or null if not deleted
 */
const deleteFolderIfEmpty = async folder => {
  try {
    const res = await cloudinary.api.delete_folder(folder);
    return res; // { message: 'ok' } if deleted
  } catch (e) {
    // Will fail with 409 if not empty or has subfolders; we silently ignore
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
