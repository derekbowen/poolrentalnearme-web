const log = require('log');
const Ajv = require('ajv');
const merge = require('lodash/merge');
const omit = require('lodash/omit');
const verifyJwt = require('extensions/common/mod/jwt/verify');
const jwtMiddlewareOptionsSchema = require('extensions/common/schemas/jwtMiddlewareOptionsSchema');
const verifyPermissions = require('extensions/common/permissions/mod/loginAs/verifier');
const { sendUnauthorized } = require('extensions/common/mod/jwt/sendUnauthorized');
const authenticatedUser = require('./authenticatedUser');

const defaultOptions = {
  requireCurrentUserDetail: false,
  requireTrustedSdk: false,
  alwaysDenormalised: false,
};

const authenticateJwtUser = (inputOpts = {}) => {
  const ajv = new Ajv();
  const opts = merge(defaultOptions, inputOpts);
  const optsValidity = ajv.validate(jwtMiddlewareOptionsSchema, opts);
  if (!optsValidity) {
    throw new Error(JSON.stringify(ajv.errors));
  }

  return async (req, res, next) => {
    req.currentUser = null;
    const { requireCurrentUserDetail, requireTrustedSdk, issuer, audience } = opts;
    try {
      const currentJwt = req.headers.jauthorization?.replace('Bearer ', '');
      if (!currentJwt) {
        return authenticatedUser(opts)(req, res, next);
      }
      const { payload } = await verifyJwt({
        jwt: currentJwt,
        issuer,
        audience,
      }).catch((e) => {
        log.error('Error in verifyJwt', e);
        return {};
      });
      if (!payload) {
        return sendUnauthorized(res);
      }
      const { currentUser, loggedInAsUser } = payload;

      if (requireCurrentUserDetail || requireTrustedSdk) {
        return authenticatedUser(
          omit(
            merge(opts, {
              currentLoggedInAsUserId: loggedInAsUser?.id?.uuid,
            }),
            ['issuer', 'audience']
          )
        )(req, res, next);
      }

      if (loggedInAsUser?.id) {
        const verificationResult = verifyPermissions({
          currentUser,
          url: req.originalUrl.replace('/api/', ''),
          loginAsUserId: loggedInAsUser.id.uuid,
          req,
        });
        if (verificationResult.error) {
          return sendUnauthorized(res, verificationResult.error);
        }
        req.currentUser = loggedInAsUser;
        req.impersonator = currentUser;
      } else {
        req.currentUser = currentUser;
      }

      return next();
    } catch (error) {
      log.error('Error in authenticateJwtUser', error);
      return sendUnauthorized(res);
    }
  };
};

module.exports = authenticateJwtUser;
