const { getSdk } = require('../../../api-util/sdk');

const marketplaceSdkMiddleware = (opts = {}) => {
  return (req, res, next) => {
    const sdk = getSdk(req, res, opts);
    req.sdk = sdk;
    next();
  };
};

module.exports = marketplaceSdkMiddleware;
