const passport = require('passport');
const AppleStrategy = require('passport-apple');

const getCallbackUrl = require('../../common/utils/callbackUrl');
const config = require('../../common/config');
const { tryParse } = require('../../common/utils/json');

const strategyName = 'apple';
exports.strategyName = strategyName;

const getStrategyOptions = ({ clientID, teamID, keyID, privateKeyString }) => {
  const strategyOptions = {
    clientID,
    teamID,
    keyID,
    callbackURL: getCallbackUrl(strategyName),
    passReqToCallback: true,
    privateKeyString,
  };

  return strategyOptions;
};

const verifyCallback = (req, accessToken, refreshToken, idToken, profile, done) => {
  try {
    const { state, user } = req.body;
    const { email } = tryParse(user);
    const queryParams = tryParse(state);

    const { from, defaultReturn = '/', defaultConfirm = '/confirm' } = queryParams;

    done(null, {
      email,
      firstName: undefined, // User must provide the firstName on ConfirmPage
      lastName: undefined, // User must provide the lastName on ConfirmPage
      idpToken: idToken,
      refreshToken,
      from,
      defaultReturn,
      defaultConfirm,
    });
  } catch (e) {
    done(e);
  }
};

const getStrategy = ({ clientID, teamID, keyID, privateKeyString }) => {
  if (clientID && teamID && keyID && privateKeyString) {
    return new AppleStrategy(
      getStrategyOptions({ clientID, teamID, keyID, privateKeyString }),
      verifyCallback
    );
  }
  return null;
};

const setup = () => {
  const strategy = getStrategy({
    clientID: config.apple.clientID,
    keyID: config.apple.keyID,
    teamID: config.apple.teamID,
    privateKeyString: config.apple.privateKeyString,
  });

  if (strategy) {
    passport.use(strategy);
  }
};

exports.setup = setup;
