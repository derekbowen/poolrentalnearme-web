const acceptWithPaymentSchema = {
  type: 'object',
  properties: {
    txId: {
      type: 'object',
      properties: { uuid: { type: 'string' } },
      required: ['uuid'],
      additionalProperties: true,
    },
    params: { type: 'object' },
  },
  required: ['txId'],
  additionalProperties: false,
};

module.exports = acceptWithPaymentSchema;
