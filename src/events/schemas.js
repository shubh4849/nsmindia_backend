const Joi = require('joi');

// Base helper
const base = {
  event: Joi.string().required(),
  at: Joi.number()
    .integer()
    .optional(),
};

// Folder events
const folderEventSchema = Joi.object()
  .keys({
    ...base,
    folderId: Joi.alternatives()
      .try(Joi.string(), Joi.any())
      .optional(),
    name: Joi.string().optional(),
    parentId: Joi.alternatives()
      .try(Joi.string(), Joi.valid(null))
      .optional(),
    rootFolderId: Joi.alternatives()
      .try(Joi.string(), Joi.any())
      .optional(),
    deletedFolderIds: Joi.array()
      .items(Joi.alternatives().try(Joi.string(), Joi.any()))
      .optional(),
  })
  .unknown(true)
  .custom((value, helpers) => {
    const e = value.event;
    if (e === 'FOLDER_CREATED' || e === 'FOLDER_UPDATED' || e === 'FOLDER_DELETED') {
      if (!value.folderId) return helpers.error('any.invalid');
    }
    if (e === 'FOLDER_TREE_DELETED') {
      if (!value.rootFolderId) return helpers.error('any.invalid');
    }
    return value;
  }, 'folder event guard');

// File events
const fileEventSchema = Joi.object()
  .keys({
    ...base,
    fileId: Joi.alternatives()
      .try(Joi.string(), Joi.any())
      .required(),
    folderId: Joi.alternatives()
      .try(Joi.string(), Joi.valid(null))
      .optional(),
    name: Joi.string().optional(),
    mimeType: Joi.string().optional(),
    fileSize: Joi.number()
      .integer()
      .min(0)
      .optional(),
  })
  .unknown(true)
  .custom((value, helpers) => {
    const e = value.event;
    if (e !== 'FILE_CREATED' && e !== 'FILE_DELETED') return helpers.error('any.invalid');
    return value;
  }, 'file event kind');

// Progress events
const progressEventSchema = Joi.object()
  .keys({
    ...base,
    uploadId: Joi.string().required(),
    status: Joi.string()
      .valid('uploading', 'completed', 'failed')
      .required(),
    progress: Joi.number()
      .min(0)
      .max(100)
      .optional(),
    uploadedBytes: Joi.number()
      .integer()
      .min(0)
      .optional(),
    fileSize: Joi.number()
      .integer()
      .min(0)
      .optional(),
    fileName: Joi.string().optional(),
  })
  .unknown(true)
  .custom((value, helpers) => {
    const e = value.event;
    if (!['UPLOAD_PROGRESS', 'UPLOAD_COMPLETED', 'UPLOAD_FAILED'].includes(e)) return helpers.error('any.invalid');
    return value;
  }, 'progress kind');

module.exports = {
  folderEventSchema,
  fileEventSchema,
  progressEventSchema,
};
