const Joi = require('joi');
const {objectId} = require('./custom.validation');

const createFolder = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    parentId: Joi.string().custom(objectId),
    description: Joi.string(),
    path: Joi.string().required(),
  }),
};

const getFolder = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId),
  }),
};

const updateFolder = {
  params: Joi.object().keys({
    folderId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      parentId: Joi.string().custom(objectId),
      description: Joi.string(),
      path: Joi.string(),
    })
    .min(1),
};

const deleteFolder = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId),
  }),
};

const getFolders = {
  query: Joi.object().keys({
    name: Joi.string(),
    parentId: Joi.string()
      .custom(objectId)
      .allow(null),
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
  createFolder,
  getFolder,
  updateFolder,
  deleteFolder,
  getFolders,
};
