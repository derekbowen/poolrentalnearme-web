const passport = require('passport');
const { strategyName } = require('../../../mod/passports/apple');
const createStateString = require('../../../common/utils/createStateString');

const authenticate = (req, res, next) => {
  return passport.authenticate(strategyName, {
    state: createStateString(req.query),
  })(req, res, next);
};

module.exports = authenticate;
