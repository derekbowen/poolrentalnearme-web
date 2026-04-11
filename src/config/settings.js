import { subUnitDivisors, currencyFormatting, stripeSupportedCurrencies } from './settingsCurrency';

// NOTE: only expose configuration that should be visible in the
// client side, don't add any server secrets in this file.
//
// To pass environment variables to the client app in the build
// script, react-scripts (and the sharetribe-scripts fork of
// react-scripts) require using the VITE_ prefix to avoid
// exposing server secrets to the client side.

const appSettings = {
  env: import.meta.env.VITE_ENV,
  dev: import.meta.env.VITE_ENV === 'development',
  verbose: false,

  sdk: {
    clientId: import.meta.env.VITE_SHARETRIBE_SDK_CLIENT_ID,
    baseUrl: import.meta.env.VITE_SHARETRIBE_SDK_BASE_URL,
    loginAsBaseUrl: import.meta.env.VITE_SHARETRIBE_SDK_LOGIN_AS_BASE_URL,
    assetCdnBaseUrl: import.meta.env.VITE_SHARETRIBE_SDK_ASSET_CDN_BASE_URL,
    transitVerbose: import.meta.env.VITE_SHARETRIBE_SDK_TRANSIT_VERBOSE === 'true',
  },

  // Get currency formatting options for given currency.
  // See: https://github.com/yahoo/react-intl/wiki/API#formatnumber
  getCurrencyFormatting: currencyFormatting,
  // It's not guaranteed that currencies can be split to 100 subunits!
  subUnitDivisors,

  stripeSupportedCurrencies,

  // Sentry DSN (Data Source Name), a client key for authenticating calls to Sentry
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,

  // If webapp is using SSL (i.e. it's behind 'https' protocol)
  usingSSL: import.meta.env.VITE_SHARETRIBE_USING_SSL === 'true',
};

export default appSettings;
