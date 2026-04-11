const sendOTPSchema = {
  type: 'object',
  properties: {
    phoneNumber: { type: 'string', pattern: '^\\+1[0-9]{10}$' },
    email: { type: 'string', format: 'email' },
  },
  required: ['phoneNumber', 'email'],
  additionalProperties: false,
};

module.exports = sendOTPSchema;
