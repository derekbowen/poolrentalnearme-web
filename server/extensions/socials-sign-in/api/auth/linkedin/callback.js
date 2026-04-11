const passport = require('passport');
const { strategyName } = require('../../../mod/passports/linkedIn');
const loginWithIdp = require('../../../common/loginWithIdp');
const config = require('../../../common/config');

const authenticateCallback = (req, res, next) => {
  const sessionFn = (error, user) =>
    loginWithIdp({
      error,
      req,
      res,
      user,
      idpClientId: config.linkedin.clientID,
      idpId: config.linkedin.idpId,
    });
  return passport.authenticate(strategyName, sessionFn)(req, res, next);
};

module.exports = authenticateCallback;
