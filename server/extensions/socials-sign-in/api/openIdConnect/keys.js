const crypto = require('crypto');
const config = require('../../common/config');

const getJwks = () => {
  return [
    {
      alg: config.supportedAlgorithm,
      kid: config.rsa.keyID,
      ...crypto
        .createPublicKey(Buffer.from(config.rsa.publicKey, 'base64'))
        .export({ format: 'jwk' }),
    },
  ];
};

const getKeys = async (req, res) => {
  const keys = getJwks();
  return res.json({
    keys,
  });
};

module.exports = getKeys;
