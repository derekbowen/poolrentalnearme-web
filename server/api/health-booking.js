const { types } = require('sharetribe-flex-sdk');
const { transactionLineItems } = require('../api-util/lineItems');
const {
  calculateTotalForCustomer,
  calculateTotalForProvider,
} = require('../api-util/lineItemHelpers');
const integrationSdk = require('../api-util/integration');

/**
 * GET /api/health/booking — probe for the WEST smoke monitor.
 *
 *   200 {"ok":true}   healthy
 *   503 {"ok":false}  unhealthy
 *
 * The body never says which check failed and never describes configuration:
 * the endpoint is reachable publicly (through nginx's generic /api/ route, which
 * is the point — it proves that route reaches the marketplace). Failing check
 * NAMES go to the server log; values are never logged or returned.
 *
 * No external calls and no data access: it runs the real booking price code on a
 * fixed synthetic hourly listing and checks the result to the cent.
 */

const { Money } = types;
const HOUR = 60 * 60 * 1000;
const GUEST_FEE = { percentage: 15 };
const HOST_FEE = { percentage: 0 };

const listing = {
  id: { uuid: 'health-check' },
  attributes: {
    price: new Money(8000, 'USD'),
    availabilityPlan: { timezone: 'Etc/UTC' },
    publicData: {
      unitType: 'hour',
      priceVariationsEnabled: true,
      priceVariants: [
        { name: 'Per hour', priceInSubunits: 8000 },
        { name: '3+ hours', priceInSubunits: 7000 },
      ],
    },
  },
};

const quote = (hours, priceVariantName) => {
  const start = new Date(Math.ceil((Date.now() + 30 * 24 * HOUR) / HOUR) * HOUR);
  const items = transactionLineItems(
    listing,
    { bookingStart: start, bookingEnd: new Date(start.getTime() + hours * HOUR), priceVariantName },
    HOST_FEE,
    GUEST_FEE
  );
  return {
    guest: calculateTotalForCustomer(items).amount,
    host: calculateTotalForProvider(items).amount,
  };
};

// Expected cents: guest pays rate x hours + 15%; host keeps rate x hours.
const CHECKS = {
  standardRate: () => {
    const q = quote(2, 'Per hour');
    return q.guest === 18400 && q.host === 16000;
  },
  tierNotGrantedBelowMinimum: () => {
    const q = quote(2, '3+ hours');
    return q.guest === 18400 && q.host === 16000;
  },
  tierGrantedAtMinimum: () => {
    const q = quote(3, '3+ hours');
    return q.guest === 24150 && q.host === 21000;
  },
  serverConfig: (env) =>
    !!integrationSdk &&
    !!env.STRIPE_SECRET_KEY &&
    !!(env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID || env.VITE_SHARETRIBE_SDK_CLIENT_ID),
};

const failingChecks = (env = process.env) =>
  Object.keys(CHECKS).filter((name) => {
    try {
      return !CHECKS[name](env);
    } catch (e) {
      return true;
    }
  });

const handler = (req, res) => {
  const failing = failingChecks();
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  if (failing.length) {
    console.error('HEALTH_BOOKING_FAIL', failing.join(','));
    return res.status(503).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
};

module.exports = handler;
module.exports.failingChecks = failingChecks;
