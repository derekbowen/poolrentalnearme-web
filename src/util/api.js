// These helpers are calling this template's own server-side routes
// so, they are not directly calling Marketplace API or Integration API.
// You can find these api endpoints from 'server/api/...' directory

import Decimal from 'decimal.js';
import Axios from 'axios';
import appSettings from '../config/settings';
import { types as sdkTypes, transit } from './sdkLoader';

export const apiBaseUrl = (marketplaceRootURL) => {
  const port = import.meta.env.VITE_DEV_API_SERVER_PORT;
  const useDevApiServer = import.meta.env.MODE === 'development' && !!port;

  // In development, the dev API server is running in a different port
  if (useDevApiServer) {
    return `http://localhost:${port}`;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return marketplaceRootURL?.replace(/\/$/, '') ?? '';
};

// Application type handlers for JS SDK.
//
// NOTE: keep in sync with `typeHandlers` in `server/api-util/sdk.js`
export const typeHandlers = [
  // Use Decimal type instead of SDK's BigDecimal.
  {
    type: sdkTypes.BigDecimal,
    customType: Decimal,
    writer: (v) => new sdkTypes.BigDecimal(v.toString()),
    reader: (v) => new Decimal(v.value),
  },
];

const serialize = (data) => {
  return transit.write(data, { typeHandlers, verbose: appSettings.sdk.transitVerbose });
};

const deserialize = (str) => {
  return transit.read(str, { typeHandlers });
};

const methods = {
  POST: 'POST',
  GET: 'GET',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
};

const parseResponseData = (response) => {
  const { data, headers } = response;
  const contentType = headers['Content-Type'] ?? headers['content-type'];
  if (contentType?.includes('application/transit+json')) {
    return deserialize(data);
  }
  if (contentType?.includes('application/json')) {
    return JSON.parse(data);
  }
  return data;
};

const axios = Axios.create({
  baseURL: apiBaseUrl(),
});

axios.interceptors.response.use(
  (response) => {
    const data = parseResponseData(response);
    response.data = data;
    return response;
  },
  (error) => {
    // If error is AxiosError, we can parse the response data
    const data = error.response ? parseResponseData(error.response) : {};
    let e = new Error();
    e = Object.assign(e, data);
    throw e;
  }
);

// If server/api returns data from SDK, you should set Content-Type to 'application/transit+json'
const request = async (path, options = {}) => {
  const {
    credentials = 'include',
    headers = { 'Content-Type': 'application/transit+json' },
    body,
    method,
    ...rest
  } = options;

  // If headers are not set, we assume that the body should be serialized as transit format.
  const shouldSerializeBody = headers['Content-Type'] === 'application/transit+json' && body;
  const bodyMaybe = shouldSerializeBody
    ? {
        data: serialize(body),
      }
    : {};

  const response = await axios.request({
    url: path,
    method,
    headers,
    withCredentials: credentials === 'include',
    responseType: 'text',
    ...bodyMaybe,
    ...rest,
  });

  return response.data;
};

// Keep the previous parameter order for the post method.
// For now, only POST has own specific function, but you can create more or use request directly.
const post = (path, body, options = {}) => {
  const requestOptions = {
    ...options,
    method: methods.POST,
    body,
  };

  return request(path, requestOptions);
};

// Fetch transaction line items from the local API endpoint.
//
// See `server/api/transaction-line-items.js` to see what data should
// be sent in the body.
export const transactionLineItems = (body) => {
  return post('/api/transaction-line-items', body);
};

// Initiate a privileged transaction.
//
// With privileged transitions, the transactions need to be created
// from the backend. This endpoint enables sending the order data to
// the local backend, and passing that to the Marketplace API.
//
// See `server/api/initiate-privileged.js` to see what data should be
// sent in the body.
export const initiatePrivileged = (body) => {
  return post('/api/initiate-privileged', body);
};

// Transition a transaction with a privileged transition.
//
// This is similar to the `initiatePrivileged` above. It will use the
// backend for the transition. The backend endpoint will add the
// payment line items to the transition params.
//
// See `server/api/transition-privileged.js` to see what data should
// be sent in the body.
export const transitionPrivileged = (body) => {
  return post('/api/transition-privileged', body);
};

// Create user with identity provider (e.g. Facebook or Google)
//
// If loginWithIdp api call fails and user can't authenticate to Marketplace API with idp
// we will show option to create a new user with idp.
// For that user needs to confirm data fetched from the idp.
// After the confirmation, this endpoint is called to create a new user with confirmed data.
//
// See `server/api/auth/createUserWithIdp.js` to see what data should
// be sent in the body.
export const createUserWithIdp = (body) => {
  return post('/api/socials-sign-in/auth/create-user-with-idp', body);
};

export const autoAcceptTxViaOperator = (body) => {
  return post('/api/accept-tx-via-operator', body);
};

export const signUpApi = (body) => {
  return post('/api/auth/sign-up', body);
};

// ── Payout dashboard ────────────────────────────────────────────────────────
// GET helpers for the payouts endpoints (server/api/payouts.js). These return
// plain JSON (not transit); the axios interceptor parses by content type.
const get = (path) => {
  return request(path, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
};

export const getPayoutSummary = () => {
  return get('/api/payouts/summary');
};

export const getPayoutList = ({ limit, startingAfter } = {}) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit);
  if (startingAfter) params.set('starting_after', startingAfter);
  const qs = params.toString();
  return get(`/api/payouts/list${qs ? `?${qs}` : ''}`);
};

export const getPayoutActivity = ({ limit, startingAfter } = {}) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit);
  if (startingAfter) params.set('starting_after', startingAfter);
  const qs = params.toString();
  return get(`/api/payouts/activity${qs ? `?${qs}` : ''}`);
};
