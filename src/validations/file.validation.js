const Joi = require('joi');
const {objectId} = require('./custom.validation');

const createFile = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    originalName: Joi.string().required(),
    filePath: Joi.string().required(),
    fileSize: Joi.number().required(),
    mimeType: Joi.string().required(),
    folderId: Joi.string()
      .custom(objectId)
      .required(),
    description: Joi.string(),
  }),
};

const getFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId),
  }),
};

const updateFile = {
  params: Joi.object().keys({
    fileId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      description: Joi.string(),
    })
    .min(1),
};

const deleteFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createFile,
  getFile,
  updateFile,
  deleteFile,
};
