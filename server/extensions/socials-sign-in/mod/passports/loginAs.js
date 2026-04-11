const passport = require('passport');
const jose = require('jose');
const crypto = require('crypto');
const LoginAsStrategy = require('../passport-login-as-oauth2');

const getCallbackUrl = require('../../common/utils/callbackUrl');
const config = require('../../common/config');
const { tryParse } = require('../../common/utils/json');
const { createIdToken } = require('../../common/utils/idToken');

const strategyName = 'login-as';
exports.strategyName = strategyName;

const privateKeyInPKCS8 = crypto
  .createPrivateKey(Buffer.from(config.loginAs.rsaPrivateKey, 'base64').toString('utf-8'))
  .export({ type: 'pkcs8' });

const getStrategyOptions = ({ clientID, clientSecret }) => {
  const strategyOptions = {
    clientID,
    callbackURL: getCallbackUrl(strategyName),
    clientSecret,
    passReqToCallback: true,
    scope: ['openid', 'email', 'profile'],
  };

  return strategyOptions;
};

const verifyCallback = async (req, accessToken, tokenSecret, profile, done) => {
  try {
    const { email, givenName, familyName, id, emailVerified } = profile;
    const { state } = req.query;
    const queryParams = tryParse(state);

    const { from, defaultReturn = '/', defaultConfirm = '/confirm' } = queryParams;

    done(null, {
      email,
      firstName: givenName, // User must provide the firstName on ConfirmPage
      lastName: familyName, // User must provide the lastName on ConfirmPage
      idpToken: await createIdToken(
        config.loginAs.clientID,
        {
          email,
          firstName: givenName,
          lastName: familyName,
          emailVerified,
          userId: id,
        },
        {
          signingAlg: config.supportedAlgorithm,
          rsaPrivateKey: await jose.importPKCS8(privateKeyInPKCS8, config.supportedAlgorithm),
          keyId: config.loginAs.rsaKeyId,
        }
      ),
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
    return new LoginAsStrategy(getStrategyOptions({ clientID, clientSecret }), verifyCallback);
  }
  return null;
};

const setup = () => {
  const strategy = getStrategy({
    clientID: config.loginAs.clientID,
    clientSecret: config.loginAs.clientSecret,
  });

  if (strategy) {
    passport.use(strategy);
  }
};

exports.setup = setup;
