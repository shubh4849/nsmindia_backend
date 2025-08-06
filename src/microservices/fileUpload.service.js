const uuid = require('uuid').v4;
const multer = require('multer');
const storage = multer.memoryStorage();
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');
const {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} = require('@aws-sdk/client-s3');

const config = require('../config/config');
const {fileTypes} = require('../constants');
const {accessKeyId, region, secretAccessKey, name} = config.aws.s3;

const s3client = new S3Client({
  region,
  credentials: {accessKeyId, secretAccessKey},
});

async function fileFilter(req, file, cb) {
  if (fileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file or data, only JPEG ,PNG and pdf is allowed!'), false);
  }
}

const multerUpload = multer({
  storage,
  fileFilter,
  // limits: { fileSize: 10000000, files: 10 },
});

async function getObjectURL(Key, signedUrl = false) {
  const command = new GetObjectCommand({Key, Bucket: name});
  const url = await getSignedUrl(s3client, command);
  return {
    key: Key,
    url: signedUrl ? url : url.split('?')[0],
  };
}

async function s3Delete(Key) {
  const command = new DeleteObjectCommand({Key, Bucket: name});
  return await s3client.send(command);
}

async function s3Upload(files, folder = 'uploads') {
  const params = files.map(file => {
    return {
      Bucket: name,
      Key: `${folder}/${uuid()}-${file.originalname}`,
      Body: file.buffer,
    };
  });

  return await Promise.all(
    params.map(param =>
      s3client
        .send(new PutObjectCommand(param))
        .then(async () => await getObjectURL(param.Key))
        .catch(() => null)
    )
  );
}

module.exports = {
  s3Upload,
  s3Delete,
  getObjectURL,
  multerUpload,
};
