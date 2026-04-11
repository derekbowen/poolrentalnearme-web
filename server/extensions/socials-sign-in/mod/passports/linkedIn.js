const passport = require('passport');
const LinkedInStrategy = require('../passport-linkedin-oauth2/passport-linkedin-oauth2');

const getCallbackUrl = require('../../common/utils/callbackUrl');
const config = require('../../common/config');
const { tryParse } = require('../../common/utils/json');

const strategyName = 'linkedin';
exports.strategyName = strategyName;

const getStrategyOptions = ({ clientID, clientSecret }) => {
  const strategyOptions = {
    clientID,
    callbackURL: getCallbackUrl(strategyName),
    passReqToCallback: true,
    clientSecret,
    scope: ['openid', 'email', 'profile'],
  };

  return strategyOptions;
};

const verifyCallback = async (req, accessToken, refreshToken, params, profile, done) => {
  try {
    const { email, givenName, familyName } = profile;
    const { state } = req.query;
    const queryParams = tryParse(state);

    const { from, defaultReturn = '/', defaultConfirm = '/confirm' } = queryParams;
    done(null, {
      email,
      firstName: givenName,
      lastName: familyName,
      idpToken: params.id_token,
      from,
      defaultReturn,
      defaultConfirm,
    });
  } catch (e) {
    console.error(e);
    done(e);
  }
};

const getStrategy = ({ clientID, clientSecret }) => {
  if (clientID && clientSecret) {
    return new LinkedInStrategy(getStrategyOptions({ clientID, clientSecret }), verifyCallback);
  }
  return null;
};

const setup = () => {
  const strategy = getStrategy({
    clientID: config.linkedin.clientID,
    clientSecret: config.linkedin.clientSecret,
  });

  if (strategy) {
    passport.use(strategy);
  }
};

exports.setup = setup;
