const {
  ENCRYPTED_JWT_PRIVATE_KEY: encryptedJwtPrivateKey,
  VITE_ENCRYPTED_JWT_PUBLIC_KEY: encryptedJwtPublicKey,
} = process.env;
const issuer = 'urn:journeyhorizon:sharetribehorizont';
const audience = 'urn:journeyhorizon:user';
const expireTime = '24h';

module.exports = {
  encryptedJwtPrivateKey,
  encryptedJwtPublicKey,
  issuer,
  audience,
  expireTime,
};
