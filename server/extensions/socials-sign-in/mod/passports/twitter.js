const TwitterStrategy = require('passport-twitter').Strategy;
const crypto = require('crypto');
const jose = require('jose');
const passport = require('passport');
const config = require('../../common/config');
const getCallbackUrl = require('../../common/utils/callbackUrl');
const { createIdToken } = require('../../common/utils/idToken');
const { tryParse } = require('../../common/utils/json');

const strategyName = 'twitter';
exports.strategyName = strategyName;

const getStrategyOptions = ({ consumerKey, consumerSecret }) => {
  return {
    consumerKey,
    consumerSecret,
    callbackURL: getCallbackUrl(strategyName),
    passReqToCallback: true,
    includeEmail: true,
  };
};

const privateKeyInPKCS8 = crypto
  .createPrivateKey(Buffer.from(config.rsa.privateKey, 'base64').toString('utf-8'))
  .export({ type: 'pkcs8' });

const verifyCallback = async (req, token, tokenSecret, profile, done) => {
  try {
    const { state } = req.query;
    const queryParams = tryParse(state);
    const { from, defaultReturn = '/', defaultConfirm = '/confirm' } = queryParams;
    const { email, displayName, id } = profile;
    const [firstName, lastName] = displayName.split(' ');

    done(null, {
      email,
      firstName,
      lastName,
      idpToken: await createIdToken(
        config.twitter.clientID,
        {
          email,
          firstName,
          lastName,
          emailVerified: false,
          userId: id,
        },
        {
          signingAlg: config.supportedAlgorithm,
          rsaPrivateKey: await jose.importPKCS8(privateKeyInPKCS8, config.supportedAlgorithm),
          keyId: config.rsa.keyID,
        }
      ),
      from,
      defaultReturn,
      defaultConfirm,
    });
  } catch (e) {
    done(e);
  }
};

const getStrategy = ({ consumerKey, consumerSecret }) => {
  if (consumerKey && consumerSecret) {
    return new TwitterStrategy(getStrategyOptions({ consumerKey, consumerSecret }), verifyCallback);
  }
  return null;
};

const setup = () => {
  const strategy = getStrategy({
    consumerKey: config.twitter.consumerKey,
    consumerSecret: config.twitter.consumerSecret,
  });

  if (strategy) {
    passport.use(strategy);
  }
};

exports.setup = setup;
