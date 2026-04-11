const assert = require('assert');
const jose = require('jose');
const config = require('../config');

/**
 * @param {string} idpClientId
 * @param {object} userData
 * @param {string} userData.email
 * @param {string} userData.userId
 * @param {string} [userData.firstName]
 * @param {string} [userData.lastName]
 * @param {boolean} [userData.emailVerified = true]
 * @param {object} options
 * @param {string} options.signingAlg
 * @param {string} options.rsaPrivateKey
 * @param {string} options.keyId
 *
 * @returns {Promise<string>}
 */
const createIdToken = (idpClientId, userData, options = {}) => {
  const { signingAlg, rsaPrivateKey, keyId, issuerPath } = options;
  assert(idpClientId, 'Missing idp client id!');
  assert(userData, 'Missing user information!');
  assert(signingAlg, 'Missing signing algorithm!');
  assert(signingAlg === config.supportedAlgorithm, `${signingAlg} is not currently supported!`);
  assert(rsaPrivateKey, 'Missing RSA private key!');
  assert(keyId, 'Missing key id!');

  const { userId, firstName, lastName, email, emailVerified } = userData;

  const token = new jose.SignJWT({
    given_name: firstName,
    family_name: lastName,
    email,
    email_verified: emailVerified,
  })
    .setProtectedHeader({ alg: signingAlg, kid: keyId })
    .setIssuedAt()
    .setIssuer(
      issuerPath
        ? `${config.rootUrl}/api/socials-sign-in/${issuerPath}`
        : `${config.rootUrl}/api/socials-sign-in/login-as`
    )
    .setSubject(userId)
    .setAudience(idpClientId)
    .setExpirationTime('1h')
    .sign(rsaPrivateKey);

  return token;
};

exports.createIdToken = createIdToken;
