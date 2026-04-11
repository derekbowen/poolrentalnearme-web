const intercomConfigSchema = {
  type: 'object',
  properties: {
    token: { type: 'string' },
  },
  required: ['token'],
  additionalProperties: false,
};

module.exports = intercomConfigSchema;
