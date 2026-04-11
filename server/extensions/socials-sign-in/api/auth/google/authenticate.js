const passport = require('passport');
const createStateString = require('../../../common/utils/createStateString');
const { strategyName } = require('../../../mod/passports/google');

const authenticate = (req, res, next) => {
  return passport.authenticate(strategyName, {
    scope: [
      'https://www.googleapis.com/auth/plus.login',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: createStateString(req.query),
  })(req, res, next);
};

module.exports = authenticate;
