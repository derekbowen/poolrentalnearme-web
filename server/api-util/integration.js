const sharetribeIntegrationSdk = require('sharetribe-flex-integration-sdk');
const log = require('../log');
const sdkUtils = require('./sdk');
const wrapInstanceWithResponseTransformer = require('./wrapInstanceWithResponseTransformer');
const {
  resolveIntegrationCredentials,
  ID_VARS,
  SECRET_VARS,
} = require('./integrationCredentials');

const env = process.env.VITE_ENV || 'development';

// Accepts all three env var spellings in use across our boxes; see
// ./integrationCredentials.js for the precedence order and why it matters.
// Absence still yields `module.exports === null` — 25 call sites guard on
// `if (!integrationSdk)` — but it is no longer silent.
const credentials = resolveIntegrationCredentials(process.env);
const { clientId, clientSecret } = credentials;

// Unset is legitimate in dev, so console-warn everywhere but only page Sentry in
// production, where an unconfigured Integration SDK is a live outage.
const reportMisconfiguration = (message, code, data) => {
  log.warn(`[integration-sdk] ${message}`, data);
  if (env === 'production') {
    log.error(new Error(`Sharetribe Integration SDK ${message}`), code, data);
  }
};

if (!credentials.configured) {
  reportMisconfiguration(
    `disabled: no ${credentials.missing.join(' and ')} configured — promo codes, iCal, ` +
      'wishlist writes and the SMS poller are inert',
    'integration-sdk-not-configured',
    { checkedIdVars: ID_VARS, checkedSecretVars: SECRET_VARS }
  );
} else if (credentials.mismatchedPrefix) {
  reportMisconfiguration(
    'credentials use mismatched env var prefixes',
    'integration-sdk-mismatched-env-prefix',
    { idVar: credentials.idVar, secretVar: credentials.secretVar }
  );
}

const queryLimiter =
  env !== 'production'
    ? sharetribeIntegrationSdk.util.createRateLimiter(
        sharetribeIntegrationSdk.util.devQueryLimiterConfig
      )
    : sharetribeIntegrationSdk.util.createRateLimiter(
        sharetribeIntegrationSdk.util.prodQueryLimiterConfig
      );

const commandLimiter =
  env !== 'production'
    ? sharetribeIntegrationSdk.util.createRateLimiter(
        sharetribeIntegrationSdk.util.devCommandLimiterConfig
      )
    : sharetribeIntegrationSdk.util.createRateLimiter(
        sharetribeIntegrationSdk.util.prodCommandLimiterConfig
      );

const instance =
  !clientId || !clientSecret
    ? null
    : wrapInstanceWithResponseTransformer(
        sharetribeIntegrationSdk.createInstance({
          clientId,
          clientSecret,
          queryLimiter,
          commandLimiter,
          typeHandlers: sdkUtils.typeHandlers,
        })
      );

module.exports = instance;
