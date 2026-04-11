const sharetribeIntegrationSdk = require('sharetribe-flex-integration-sdk');
const sdkUtils = require('./sdk');
const wrapInstanceWithResponseTransformer = require('./wrapInstanceWithResponseTransformer');

const env = process.env.VITE_ENV || 'development';

const {
  SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: clientId,
  SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: clientSecret,
} = process.env;

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
