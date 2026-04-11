/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const getCallbackUrl = require('../../common/utils/callbackUrl');
const config = require('../../common/config');
const { tryParse } = require('../../common/utils/json');

const strategyName = 'facebook';
exports.strategyName = strategyName;

const getStrategyOptions = ({ clientID, clientSecret }) => {
  const strategyOptions = {
    clientID,
    clientSecret,
    callbackURL: getCallbackUrl(strategyName),
    profileFields: ['id', 'name', 'emails'],
    passReqToCallback: true,
  };

  return strategyOptions;
};

const verifyCallback = (req, accessToken, refreshToken, rawReturn, profile, done) => {
  const { email, first_name, last_name } = profile._json;
  const { state } = req.query;
  const queryParams = tryParse(state);

  const { from, defaultReturn, defaultConfirm } = queryParams;
  console.log('accessToken', accessToken);
  done(null, {
    email,
    firstName: first_name,
    lastName: last_name,
    idpToken: accessToken,
    refreshToken,
    from,
    defaultReturn,
    defaultConfirm,
  });
};

const getStrategy = ({ clientID, clientSecret }) => {
  if (clientID && clientSecret) {
    return new FacebookStrategy(getStrategyOptions({ clientID, clientSecret }), verifyCallback);
  }
  return null;
};

const setup = () => {
  const strategy = getStrategy({
    clientID: config.facebook.clientID,
    clientSecret: config.facebook.clientSecret,
  });

  if (strategy) {
    passport.use(strategy);
  }
};

exports.setup = setup;
