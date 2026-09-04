const sharetribeIntegrationSdk = require('sharetribe-flex-integration-sdk');
const sdkUtils = require('./sdk');
const wrapInstanceWithResponseTransformer = require('./wrapInstanceWithResponseTransformer');

const env = process.env.VITE_ENV || 'development';

// Resolved through the canonical alias map: EAST injects this same credential
// as SHARETRIBE_INTEG_CLIENT_ID/_SECRET, and reading only the WEST spelling
// here made `instance` silently null on that host. See sharetribeCredentials.js.
const { integrationCredentials } = require('./sharetribeCredentials');
const { clientId, clientSecret } = integrationCredentials();

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
