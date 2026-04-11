const assert = require('assert');
const config = require('../config');

const { VITE_ENV, VITE_DEV_API_SERVER_PORT, VITE_MARKETPLACE_ROOT_URL } = process.env;

const PORT = parseInt(VITE_DEV_API_SERVER_PORT, 10);

const isDevelopmentMode = VITE_ENV === 'development' && !!PORT;

/**
 * @param {'facebook' | 'google' | 'apple' | 'twitter' | 'linkedin'} provider
 * @returns {string} callbackUrl
 */
const getCallbackUrl = (provider) => {
  const baseUrl = isDevelopmentMode ? `http://localhost:${PORT}` : VITE_MARKETPLACE_ROOT_URL;

  assert(baseUrl, 'VITE_MARKETPLACE_ROOT_URL is required');
  assert(provider, 'provider is required');
  assert(config.supportedProviders.includes(provider), `Invalid provider ${provider}`);

  return `${baseUrl}/api/socials-sign-in/auth/${provider}/callback`;
};

module.exports = getCallbackUrl;
