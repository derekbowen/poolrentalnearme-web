const {
  APPLE_IPD_ID,
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY_BASE64,
  APPLE_TEAM_ID,
  FACEBOOK_APP_SECRET,
  GOOGLE_CLIENT_SECRET,
  RSA_KEY_ID,
  RSA_PRIVATE_KEY_BASE64,
  RSA_PUBLIC_KEY_BASE64,
  LOGIN_AS_RSA_KEY_ID,
  LOGIN_AS_RSA_PRIVATE_KEY_BASE64,
  LOGIN_AS_RSA_PUBLIC_KEY_BASE64,
  SESSION_SECRET,
  SHARETRIBE_SDK_CLIENT_SECRET,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  VITE_APPLE_CLIENT_ID,
  VITE_FACEBOOK_APP_ID,
  VITE_GOOGLE_CLIENT_ID,
  VITE_MARKETPLACE_ROOT_URL,
  VITE_TWITTER_CLIENT_ID,
  VITE_TWITTER_IDP_ID,
  VITE_LINKED_IN_CLIENT_ID,
  LINKED_IN_CLIENT_SECRET,
  LINKED_IN_IDP_ID,
  LOGIN_AS_CLIENT_ID,
  LOGIN_AS_IDP_ID,
  LOGIN_AS_CLIENT_SECRET,
  VITE_SHARETRIBE_SDK_CLIENT_ID,
} = process.env;

const google = {
  clientID: VITE_GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  idpId: 'google', // static value
  enabled: !!(VITE_GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
};

const facebook = {
  clientID: VITE_FACEBOOK_APP_ID,
  clientSecret: FACEBOOK_APP_SECRET,
  idpId: 'facebook', // static value
  enabled: !!(VITE_FACEBOOK_APP_ID && FACEBOOK_APP_SECRET),
};

const apple = {
  clientID: VITE_APPLE_CLIENT_ID,
  teamID: APPLE_TEAM_ID,
  keyID: APPLE_KEY_ID,
  privateKeyString: Buffer.from(APPLE_PRIVATE_KEY_BASE64 ?? '', 'base64').toString('utf-8'),
  idpId: APPLE_IPD_ID,
  enabled: !!(
    VITE_APPLE_CLIENT_ID &&
    APPLE_TEAM_ID &&
    APPLE_KEY_ID &&
    APPLE_PRIVATE_KEY_BASE64 &&
    APPLE_IPD_ID
  ),
};

const twitter = {
  clientID: VITE_TWITTER_CLIENT_ID,
  consumerKey: TWITTER_CONSUMER_KEY,
  consumerSecret: TWITTER_CONSUMER_SECRET,
  idpId: VITE_TWITTER_IDP_ID,
  enabled: !!(
    VITE_TWITTER_CLIENT_ID &&
    TWITTER_CONSUMER_KEY &&
    TWITTER_CONSUMER_SECRET &&
    VITE_TWITTER_IDP_ID
  ),
};

const linkedin = {
  clientID: VITE_LINKED_IN_CLIENT_ID,
  clientSecret: LINKED_IN_CLIENT_SECRET,
  idpId: LINKED_IN_IDP_ID,
  enabled: !!(VITE_LINKED_IN_CLIENT_ID && LINKED_IN_CLIENT_SECRET && LINKED_IN_IDP_ID),
};

const loginAs = {
  marketplaceSdkClientID: VITE_SHARETRIBE_SDK_CLIENT_ID,
  clientID: LOGIN_AS_CLIENT_ID,
  clientSecret: LOGIN_AS_CLIENT_SECRET,
  idpId: LOGIN_AS_IDP_ID,
  rsaKeyId: LOGIN_AS_RSA_KEY_ID,
  rsaPrivateKey: LOGIN_AS_RSA_PRIVATE_KEY_BASE64,
  rsaPublicKey: LOGIN_AS_RSA_PUBLIC_KEY_BASE64,
  enabled: !!(
    LOGIN_AS_CLIENT_ID &&
    LOGIN_AS_CLIENT_SECRET &&
    LOGIN_AS_IDP_ID &&
    LOGIN_AS_RSA_KEY_ID &&
    LOGIN_AS_RSA_PRIVATE_KEY_BASE64
  ),
};

module.exports = {
  clientSecret: SHARETRIBE_SDK_CLIENT_SECRET,
  rootUrl: VITE_MARKETPLACE_ROOT_URL,
  google,
  facebook,
  apple,
  twitter,
  rsa: {
    publicKey: RSA_PUBLIC_KEY_BASE64,
    privateKey: RSA_PRIVATE_KEY_BASE64,
    keyID: RSA_KEY_ID,
  },
  session: {
    secret: SESSION_SECRET,
  },
  linkedin,
  cookieMaxAge: 15 * 60 * 1000, // 15 minutes
  supportedAlgorithm: 'RS256',
  supportedProviders: ['google', 'facebook', 'apple', 'twitter', 'linkedin', 'login-as'],
  idpClientIdMapping: {
    facebook: facebook.clientID,
    google: google.clientID,
    [apple.idpId]: apple.clientID,
    [twitter.idpId]: twitter.clientID,
    [linkedin.idpId]: linkedin.clientID,
  },
  loginAs,
};
