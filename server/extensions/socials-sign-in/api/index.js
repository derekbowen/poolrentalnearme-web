/* eslint-disable import/no-dynamic-require */
/* eslint-disable global-require */
const router = require('express').Router();
const bodyParser = require('body-parser');
const session = require('express-session');
const authenticatedUser = require('extensions/common/middlewares/authenticatedUser');
const permissionManager = require('extensions/common/middlewares/permissionManager');
const {
  entities: { USER_ENTITY },
} = require('extensions/common/permissions/common/config/definition');
const dataValidator = require('../../common/middlewares/dataValidator');
const { bodyParamsSchema: loginWithIdpBodyParams, loginWithIdp } = require('./loginWithIdp');
const {
  bodyParamsSchema: createWithIdpBodyParams,
  createUserWithIdp,
} = require('./createUserWithIdp');
const config = require('../common/config');

router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

router.post('/auth/create-user-with-idp', require('./auth/createUserWithIdp'));

['google', 'facebook'].forEach((idp) => {
  if (config[idp].enabled) {
    require(`../mod/passports/${idp}`).setup();
    router.get(`/auth/${idp}`, require(`./auth/${idp}/authenticate`));
    router.get(`/auth/${idp}/callback`, require(`./auth/${idp}/callback`));
  }
});

if (config.twitter.enabled || config.linkedin.enabled) {
  // twitter and linkedin require session
  const sessionHandler = session({
    secret: config.session.secret,
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // don't create session until something stored
  });

  router.use(sessionHandler);
}

if (config.twitter.enabled) {
  require('../mod/passports/twitter').setup();
  router.get('/auth/twitter', require('./auth/twitter/authenticate'));
  router.get('/auth/twitter/callback', require('./auth/twitter/callback'));
}

if (config.linkedin.enabled) {
  require('../mod/passports/linkedIn').setup();
  router.get('/auth/linkedin', require('./auth/linkedin/authenticate'));
  router.get('/auth/linkedin/callback', require('./auth/linkedin/callback'));
}

if (config.apple.enabled) {
  require('../mod/passports/apple').setup();
  router.get('/auth/apple', require('./auth/apple/authenticate'));
  router.post('/auth/apple/callback', require('./auth/apple/callback'));
}

// API for non-web clients
router.post('/login-with-idp', dataValidator(loginWithIdpBodyParams, 'body'), loginWithIdp);
router.post(
  '/create-user-with-idp',
  dataValidator(createWithIdpBodyParams, 'body'),
  createUserWithIdp
);

// For non-OIDC supports such as Twitter,...
if (config.rsa.publicKey && config.rsa.privateKey) {
  router.get('/.well-known/openid-configuration', require('./openIdConnect/configuration'));
  router.get('/jwks.json', require('./openIdConnect/keys'));
}

if (config.loginAs.rsaPublicKey && config.loginAs.rsaPrivateKey) {
  router.get(
    '/login-as/.well-known/openid-configuration',
    require('./openIdConnect/loginAsConfiguration')
  );
  router.get('/login-as/jwks.json', require('./openIdConnect/loginAsKeys'));
}

if (config.loginAs.enabled) {
  router.use(authenticatedUser());
  const requiredPermissions = {
    [USER_ENTITY]: {
      loginAs: {
        individual: {
          user: {
            permissions: ['get'],
          },
        },
      },
    },
  };
  require('../mod/passports/loginAs').setup();
  router.get(
    '/auth/login-as/:userId',
    permissionManager({
      requiredPermissions,
      getCurrentImpactedResourceId: (req) => {
        return req.params.userId;
      },
    }),
    require('./auth/loginAs/callback')
  );
}

router.use((req, res) => res.status(404).send('Not found'));

module.exports = router;
