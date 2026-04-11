import auth from 'basic-auth';
import { basicAuth } from '../config/server';

const { password, username } = basicAuth;

const hasBasicAuth =
  typeof username === 'string' &&
  username.length > 0 &&
  typeof password === 'string' &&
  password.length > 0;

const basicAuthMiddleware = (req, res, next) => {
  if (!hasBasicAuth) {
    return next();
  }

  const user = auth(req);

  if (user && user.name === username && user.pass === password) {
    return next();
  }

  return res
    .set({ 'WWW-Authenticate': 'Basic realm="Authentication required"' })
    .status(401)
    .end("I'm afraid I cannot let you do that.");
};

export default basicAuthMiddleware;
