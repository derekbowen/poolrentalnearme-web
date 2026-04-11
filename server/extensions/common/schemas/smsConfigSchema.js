const smsConfigSchema = {
  type: 'object',
  properties: {
    senderPhoneNumber: {
      type: 'string',
    },
    accountSID: {
      type: 'string',
    },
    authToken: {
      type: 'string',
    },
  },
  required: ['senderPhoneNumber', 'accountSID', 'authToken'],
  additionalProperties: false,
};

module.exports = smsConfigSchema;
