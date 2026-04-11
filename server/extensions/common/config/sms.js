const { TWILIO_PHONE_NUMBER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
const Ajv = require('ajv');
const smsConfigSchema = require('../schemas/smsConfigSchema');

const ajv = new Ajv();

const smsConfig = {
  senderPhoneNumber: TWILIO_PHONE_NUMBER,
  accountSID: TWILIO_ACCOUNT_SID,
  authToken: TWILIO_AUTH_TOKEN,
};

const valid = ajv.validate(smsConfigSchema, smsConfig);

if (!valid) {
  throw new Error(`smsConfig validation error: ${ajv.errorsText()}`);
}

module.exports = smsConfig;
