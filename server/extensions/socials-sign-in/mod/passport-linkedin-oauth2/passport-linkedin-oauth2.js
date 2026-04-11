/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
const util = require('util');
const OAuth2Strategy = require('passport-oauth2');
const { InternalOAuthError } = require('passport-oauth2');

function Strategy(strategyOptions, verify) {
  const options = strategyOptions || {};
  options.authorizationURL =
    strategyOptions.authorizationURL || 'https://www.linkedin.com/oauth/v2/authorization';
  options.tokenURL = strategyOptions.tokenURL || 'https://www.linkedin.com/oauth/v2/accessToken';
  options.scope = strategyOptions.scope || ['openid', 'email', 'profile'];

  // By default we want data in JSON
  options.customHeaders = strategyOptions.customHeaders || { 'x-li-format': 'json' };

  OAuth2Strategy.call(this, options, verify);

  this.options = options;
  this.name = 'linkedin';
  this.profileUrl = strategyOptions.profileUrl || 'https://api.linkedin.com/v2/userinfo';
}

util.inherits(Strategy, OAuth2Strategy);

function parseProfile(body) {
  const json = JSON.parse(body);

  const { sub, email_verified, given_name, family_name, email } = json;

  return {
    provider: 'linkedin',
    id: sub,
    emailVerified: email_verified,
    email,
    givenName: given_name,
    familyName: family_name,
  };
}

Strategy.prototype.userProfile = function userProfile(accessToken, done) {
  // LinkedIn uses a custom name for the access_token parameter
  this._oauth2.setAccessTokenName('oauth2_access_token');

  this._oauth2.get(this.profileUrl, accessToken, function getProfile(err, body) {
    if (err) {
      return done(new InternalOAuthError('failed to fetch user profile', err));
    }

    try {
      const profile = parseProfile(body);
      return done(null, profile);
    } catch (e) {
      return done(new InternalOAuthError('failed to parse profile response', e));
    }
  });
};

Strategy.prototype.authorizationParams = function authorizationParams(options) {
  const params = {};

  if (options.state) {
    params.state = options.state;
  }

  return params;
};

module.exports = Strategy;
