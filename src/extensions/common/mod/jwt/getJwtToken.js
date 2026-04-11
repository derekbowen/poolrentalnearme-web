import { error } from '../../../../util/log';
import verifyJwt from './verify';

// Avoid circular dependencies

const apiBaseUrl = (marketplaceRootURL) => {
  const port = import.meta.env.VITE_DEV_API_SERVER_PORT;
  const useDevApiServer = import.meta.env.MODE === 'development' && !!port;

  // In development, the dev API server is running in a different port
  if (useDevApiServer) {
    return `http://localhost:${port}`;
  }

  // Otherwise, use the given marketplaceRootURL parameter or the same domain and port as the frontend
  return marketplaceRootURL ? marketplaceRootURL.replace(/\/$/, '') : `${window.location.origin}`;
};

const getJwtToken = async () => {
  if (typeof localStorage === 'undefined' || typeof window === 'undefined') {
    return null;
  }
  const token = localStorage.getItem('token');
  if (token) {
    const isVerified = await verifyJwt(token).catch(() => {
      localStorage.setItem('token', null);
      return false;
    });

    if (isVerified) {
      return token;
    }
  }

  const tokenDataRes = await window.fetch(`${apiBaseUrl()}/api/common/token`, {
    credentials: 'include',
  });
  const tokenData = await tokenDataRes.json();

  if (!tokenDataRes.ok || !tokenData) {
    error(new Error(tokenData), 'get-jwt-token-failed');
    return null;
  }

  const {
    data: { bearer },
  } = tokenData;

  localStorage.setItem('token', bearer);

  return bearer;
};

export default getJwtToken;
