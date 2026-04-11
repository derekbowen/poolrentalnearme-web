const passport = require('passport');
const createStateString = require('../../../common/utils/createStateString');
const { strategyName } = require('../../../mod/passports/twitter');

const authenticate = (req, res, next) => {
  return passport.authenticate(strategyName, {
    state: createStateString(req.query),
  })(req, res, next);
};

module.exports = authenticate;
