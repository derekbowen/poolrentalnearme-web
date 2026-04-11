const Ajv = require('ajv');
const assert = require('assert');
const addFormat = require('ajv-formats');
const { createError } = require('../utils/response');
const { handleError } = require('../../../api-util/sdk');

const ajv = new Ajv();
addFormat(ajv);

/**
 * @typedef {import('ajv').Schema | import('ajv').JSONSchemaType<any>} Schema
 *
 * @param {Schema} schema
 * @param {'body' | 'params' | 'query'} on
 * @returns {import('express').RequestHandler}
 */
const dataValidator = (schema, on) => {
  assert(
    ['body', 'params', 'query'].includes(on),
    'The "on" parameter must be one of "body", "params", or "query".'
  );

  const validate = ajv.compile(schema);

  return (req, res, next) => {
    const valid = validate(req[on]);
    if (!valid) {
      return handleError(
        res,
        createError({
          status: 400,
          statusText: 'Bad Request',
          message: 'Invalid request data',
          data: {
            errors: validate.errors,
          },
        })
      );
    }

    return next();
  };
};

module.exports = dataValidator;
