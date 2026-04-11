import { getMethod, postMethod } from '../common/api';

export const getStripeConnected = (userId) => {
  return getMethod(`/api/off-session-payment/stripe-connected/${userId}`);
};

export const acceptWithPayment = (body) => {
  return postMethod('/api/off-session-payment/accept', body, {
    headers: { 'Content-Type': 'application/transit+json', Accept: 'application/transit+json' },
  });
};
