/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const getCallbackUrl = require('../../common/utils/callbackUrl');
const config = require('../../common/config');
const { tryParse } = require('../../common/utils/json');

const strategyName = 'google';
exports.strategyName = strategyName;

const getStrategyOptions = ({ clientID, clientSecret }) => {
  const strategyOptions = {
    clientID,
    clientSecret,
    callbackURL: getCallbackUrl(strategyName),
    passReqToCallback: true,
  };
  return strategyOptions;
};

const verifyCallback = (req, accessToken, refreshToken, rawReturn, profile, done) => {
  const idpToken = rawReturn.id_token;

  const { email, given_name, family_name } = profile._json;
  const { state } = req.query;
  const queryParams = tryParse(state);

  const { from, defaultReturn, defaultConfirm } = queryParams;

  done(null, {
    email,
    firstName: given_name,
    lastName: family_name,
    idpToken,
    from,
    defaultReturn,
    defaultConfirm,
  });
};

const getStrategy = ({ clientID, clientSecret }) => {
  if (clientID && clientSecret) {
    return new GoogleStrategy(getStrategyOptions({ clientID, clientSecret }), verifyCallback);
  }
  return null;
};

const setup = () => {
  const strategy = getStrategy({
    clientID: config.google.clientID,
    clientSecret: config.google.clientSecret,
  });

  if (strategy) {
    passport.use(strategy);
  }
};

exports.setup = setup;
