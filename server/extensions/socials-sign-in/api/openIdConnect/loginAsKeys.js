const crypto = require('crypto');
const config = require('../../common/config');

const getJwks = () => {
  return [
    {
      alg: config.supportedAlgorithm,
      kid: config.loginAs.rsaKeyId,
      ...crypto
        .createPublicKey(Buffer.from(config.loginAs.rsaPublicKey, 'base64'))
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
