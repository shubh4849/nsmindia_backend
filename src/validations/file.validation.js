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
      .optional(),
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
    fileId: Joi.string()
      .custom(objectId)
      .required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      description: Joi.string(),
      folderId: Joi.string()
        .custom(objectId)
        .optional(),
    })
    .min(1),
};

const deleteFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId),
  }),
};

const searchFiles = {
  query: Joi.object().keys({
    q: Joi.string(),
    folderId: Joi.string().custom(objectId),
    type: Joi.string(),
    name: Joi.string(),
    description: Joi.string(),
    dateFrom: Joi.string(),
    dateTo: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10),
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
  }),
};

const getFiles = {
  query: Joi.object().keys({
    folderId: Joi.string().custom(objectId),
    name: Joi.string(),
    description: Joi.string(),
    dateFrom: Joi.string(),
    dateTo: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number()
      .integer()
      .min(1)
      .default(1),
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
  }),
};

module.exports = {
  createFile,
  getFile,
  updateFile,
  deleteFile,
  searchFiles,
  getFiles,
};
