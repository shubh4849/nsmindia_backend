const cloudinary = require('cloudinary').v2;
const config = require('../config/config');

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

/**
 * Upload a file to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} folder - The folder in Cloudinary to upload to
 * @param {string} originalName - The original name of the file (for public_id)
 * @returns {Promise<Object>}
 */
const uploadFileToCloudinary = async (fileBuffer, folder, originalName) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: 'auto',
          folder: folder,
          public_id: originalName.split('.')[0], // Use original name (without extension) as public_id
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }
          resolve(result);
        }
      )
      .end(fileBuffer);
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete
 * @returns {Promise<Object>}
 */
const deleteFileFromCloudinary = async publicId => {
  return cloudinary.uploader.destroy(publicId);
};

module.exports = {
  uploadFileToCloudinary,
  deleteFileFromCloudinary,
};
