const express = require('express');
const { openIdConfiguration, jwksUri } = require('./api-util/idToken');

const {
  RSA_PRIVATE_KEY: rsaPrivateKey,
  RSA_PUBLIC_KEY: rsaPublicKey,
  KEY_ID: keyId,
  ANDROID_APP_PACKAGE_NAME: androidAppPackageName,
  ANDROID_APP_SHA_256_FINGERPRINT: androidAppSha256Fingerprint,
  APPLE_TEAM_ID: appleTeamId,
  APPLE_BUNDLE_ID: appleBundleId,
} = process.env;

const router = express.Router();

// These .well-known/* endpoints will be enabled if you are using this template as OIDC proxy
// https://www.sharetribe.com/docs/cookbook-social-logins-and-sso/setup-open-id-connect-proxy/
if (rsaPublicKey && rsaPrivateKey) {
  router.get('/openid-configuration', openIdConfiguration);
  router.get('/jwks.json', jwksUri([{ alg: 'RS256', rsaPublicKey, keyId }]));
}

if (androidAppPackageName && androidAppSha256Fingerprint) {
  router.get('/assetlinks.json', (req, res) => {
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: androidAppPackageName,
          sha256_cert_fingerprints: [androidAppSha256Fingerprint],
        },
      },
    ]);
  });
}

if (appleTeamId && appleBundleId) {
  router.get('/apple-app-site-association', (req, res) => {
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appID: `${appleTeamId}.${appleBundleId}`,
            paths: ['*'],
          },
        ],
      },
    });
  });
}

module.exports = router;
