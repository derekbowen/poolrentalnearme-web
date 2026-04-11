import { jwtVerify, importSPKI } from 'jose';
import { encryptedJwtPublicKey } from '../../config/common';
import { warn } from '../../../../util/log';

const createVerifyFunction = (encryptedSecret) => async (jwt) => {
  const publicKey = await importSPKI(atob(encryptedSecret), 'RS256');
  return jwtVerify(jwt, publicKey);
};

export default encryptedJwtPublicKey
  ? createVerifyFunction(encryptedJwtPublicKey)
  : () => {
      warn('No encryptedJwtPublicKey found, JWT verify is disabled');
    };
