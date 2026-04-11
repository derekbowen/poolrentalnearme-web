const pick = require('lodash/pick');
const { handleError } = require('api-util/sdk');
const { handleResponse } = require('./response');

const ALLOW_KEYS = ['data', 'meta', 'included', 'message', 'statusText', 'status'];

/**
 * @typedef {Object} ResponseFormat
 * @property {Object} data
 * @property {Object} [meta]
 * @property {Object} [included]
 * @property {string} [message]
 * @property {string} [statusText]
 * @property {number} [status = 200]
 *
 * @param {(req, res, next) => Promise<ResponseFormat>} asyncHandler
 * @return {(req, res, next) => Promise<void>}
 */
const asyncRequestHandler = (asyncHandler) => {
  return async (req, res, next) => {
    try {
      const response = await asyncHandler(req, res, next);
      handleResponse({
        statusCode: response.status || 200,
        req,
        res,
        data: pick(response, ALLOW_KEYS),
      });
    } catch (error) {
      handleError(res, error);
    }
  };
};

module.exports = { asyncRequestHandler };
