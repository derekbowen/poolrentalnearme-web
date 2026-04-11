const verifyOTPSchema = {
  type: 'object',
  properties: {
    otp: { type: 'string', minLength: 6, maxLength: 6 },
    email: { type: 'string', format: 'email' },
  },
  required: ['otp', 'email'],
  additionalProperties: false,
};

module.exports = verifyOTPSchema;
