const Ajv = require('ajv');
const intercomConfigSchema = require('../schema/intercomConfigSchema');

const ajv = new Ajv();

const intercomConfig = {
  token: process.env.INTERCOM_TOKEN,
};

if (intercomConfig.token) {
  const valid = ajv.validate(intercomConfigSchema, intercomConfig);

  if (!valid) {
    throw new Error(`intercomConfig validation error: ${ajv.errorsText()}`);
  }
}

module.exports = intercomConfig;
