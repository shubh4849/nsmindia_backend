const Joi = require('joi');
const path = require('path');
const dotnev = require('dotenv');

dotnev.config({path: path.join(__dirname, '../../.env')});

// schema of env files for validation
const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid('test', 'development', 'production')
      .required(),
    PORT: Joi.number().default(8082),
    MONGODB_URL: Joi.string().required(),
    CLOUDINARY_CLOUD_NAME: Joi.string().required(),
    CLOUDINARY_API_KEY: Joi.string().required(),
    CLOUDINARY_API_SECRET: Joi.string().required(),
  })
  .unknown();

// validating the process.env object that contains all the env variables
const {value: envVars, error} = envVarsSchema.prefs({errors: {label: 'key'}}).validate(process.env);

// throw error if the validation fails or results into false
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  cloudinary: {
    cloudName: envVars.CLOUDINARY_CLOUD_NAME,
    apiKey: envVars.CLOUDINARY_API_KEY,
    apiSecret: envVars.CLOUDINARY_API_SECRET,
  },
  mongoose: {
    // exception added for TDD purpose
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
};
