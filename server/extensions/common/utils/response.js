const { serialize } = require('../../../api-util/sdk');

/**
 * @param {any} data
 * @param {int} statusCode
 * @param {object} param
 * @param {import('express').Request} param.req
 * @param {import('express').Response} param.res
 */
const handleResponse = ({ data, statusCode, req, res }) => {
  const accept = req.headers.accept || '*/*';
  if (accept.includes('application/transit+json')) {
    return res
      .status(statusCode)
      .set('Content-Type', 'application/transit+json')
      .send(serialize(data));
  }
  if (accept.includes('application/json')) {
    return res.status(statusCode).json(data);
  }
  return res.status(statusCode).send(data);
};

exports.handleResponse = handleResponse;

const defaultErrorParams = {
  status: 500,
  statusText: 'Internal Server Error',
  message: '',
  data: {},
};

/**
 * @param {object} param
 * @param {number} [param.status=500]
 * @param {string} [param.statusText='Internal Server Error']
 * @param {string} [param.message='']
 * @param {object} [param.data={}]
 * @returns {Error}
 */
const createError = ({ status, statusText, message, data } = defaultErrorParams) => {
  const error = new Error(message);
  error.status = status;
  error.statusText = statusText;
  error.data = data;
  return error;
};

exports.createError = createError;
