const sendOTPSchema = {
  type: 'object',
  properties: {
    phoneNumber: { type: 'string', pattern: '^\\+[1-9][0-9]{6,14}$' },
    email: { type: 'string', format: 'email' },
  },
  required: ['phoneNumber', 'email'],
  additionalProperties: false,
};

module.exports = sendOTPSchema;
