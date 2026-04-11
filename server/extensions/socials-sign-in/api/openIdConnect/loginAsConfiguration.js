const config = require('../../common/config');

const configuration = (req, res) => {
  return res.json({
    issuer: `${config.rootUrl}/api/socials-sign-in/login-as`,
    jwks_uri: `${config.rootUrl}/api/socials-sign-in/login-as/jwks.json`,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [config.supportedAlgorithm],
  });
};

module.exports = configuration;
