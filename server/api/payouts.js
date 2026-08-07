const { getSdk, handleError } = require('../api-util/sdk');

/**
 * Payout dashboard endpoints (GET /api/payouts/summary|list|activity).
 *
 * Our Stripe connected accounts are Sharetribe-managed CUSTOM accounts, so
 * there is no Stripe-hosted dashboard (accounts.createLoginLink is not
 * available) — we read the data with the platform secret key and render it
 * ourselves. The connected account ID is always resolved server-side from the
 * AUTHENTICATED user's own stripeAccount relationship; it is never accepted
 * from the client, so a caller can only ever see their own payouts.
 *
 * STRIPE_SECRET_KEY lives in server-side env only. Without it these endpoints
 * answer 501 so the UI can show a "not configured" state instead of breaking.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

const stripeGet = async (path, params, stripeAccount) => {
  const key = process.env.STRIPE_SECRET_KEY;
  const qs = new URLSearchParams(params || {}).toString();
  const res = await fetch(`${STRIPE_API}${path}${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'Stripe-Account': stripeAccount,
    },
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || `Stripe ${path} failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
};

// The caller's own connected account ID, or null if they have none yet.
const resolveStripeAccountId = async (req, res) => {
  const sdk = getSdk(req, res);
  try {
    const r = await sdk.stripeAccount.fetch();
    return r?.data?.data?.attributes?.stripeAccountId || null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
};

const guard = (handler) => async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(501).json({ error: 'payouts-not-configured' });
  }
  try {
    const stripeAccountId = await resolveStripeAccountId(req, res);
    if (!stripeAccountId) {
      return res.status(200).json({ stripeAccount: null });
    }
    return await handler(req, res, stripeAccountId);
  } catch (e) {
    return handleError(res, e);
  }
};

// GET /api/payouts/summary — balances, payout schedule, onboarding state.
const summary = guard(async (req, res, acct) => {
  // The account read needs accounts_kyc_basic_read; a restricted key without
  // it must degrade to "details unavailable", never sink the whole summary.
  const [balance, account] = await Promise.all([
    stripeGet('/balance', null, acct),
    stripeGet(`/accounts/${acct}`, null, undefined).catch(() => null),
  ]);
  const sum = (arr) => (arr || []).reduce((t, b) => t + (b.amount || 0), 0);
  const currency = balance.available?.[0]?.currency || 'usd';
  res.status(200).json({
    stripeAccount: acct,
    currency,
    availableAmount: sum(balance.available),
    pendingAmount: sum(balance.pending),
    payoutsEnabled: account ? !!account.payouts_enabled : null,
    requirementsCurrentlyDue: account?.requirements?.currently_due || [],
    payoutSchedule: account?.settings?.payouts?.schedule || null,
    accountDetailsAvailable: !!account,
  });
});

// GET /api/payouts/list?limit&starting_after — past payouts, paginated.
const list = guard(async (req, res, acct) => {
  const { limit = '10', starting_after } = req.query || {};
  const params = { limit: String(Math.min(parseInt(limit, 10) || 10, 100)) };
  if (starting_after) params.starting_after = starting_after;
  const payouts = await stripeGet('/payouts', params, acct);
  res.status(200).json({
    stripeAccount: acct,
    hasMore: !!payouts.has_more,
    payouts: (payouts.data || []).map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status, // paid | in_transit | pending | failed | canceled
      arrivalDate: p.arrival_date,
      created: p.created,
      description: p.description,
      failureMessage: p.failure_message || null,
    })),
  });
});

// GET /api/payouts/activity?limit&starting_after — balance transactions.
const activity = guard(async (req, res, acct) => {
  const { limit = '20', starting_after } = req.query || {};
  const params = { limit: String(Math.min(parseInt(limit, 10) || 20, 100)) };
  if (starting_after) params.starting_after = starting_after;
  const txns = await stripeGet('/balance_transactions', params, acct);
  res.status(200).json({
    stripeAccount: acct,
    hasMore: !!txns.has_more,
    activity: (txns.data || []).map((t) => ({
      id: t.id,
      type: t.type, // payment | payout | refund | adjustment ...
      amount: t.amount,
      fee: t.fee,
      net: t.net,
      currency: t.currency,
      status: t.status, // available | pending
      created: t.created,
      description: t.description,
    })),
  });
});

module.exports = { summary, list, activity };
