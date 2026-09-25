const { getSdk, handleError } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');
const { reconcileListing } = require('../api-util/calendarExceptions');

/**
 * POST /api/calendar-apply-exceptions  { listingId }
 *
 * Makes the host calendar's per-day "closed" + custom open/close hours ACTUALLY
 * enforced at checkout, by translating them into Sharetribe availability
 * exceptions (seats:0 = unbookable) — which the booking engine already respects.
 *
 *   - closed day        → one full-day exception
 *   - custom open/close  → block the time OUTSIDE [open, close] (before open + after close)
 *
 * Reconciles desired ranges against the listing's ACTUAL exceptions (see
 * api-util/calendarExceptions.js): only exceptions PRNM provably created are ever
 * deleted, existing coverage is never duplicated, and concurrent saves for the
 * same listing run one after another. Tracking lives in privateData, which the
 * edit panel never writes.
 *
 * Server reads the overrides from the listing itself (server-trusted). Owner-gated.
 * Run AFTER the panel has saved publicData.availability.dateOverrides.
 * Responds with the reconciled state.
 */
module.exports = async (req, res) => {
  const { listingId } = req.body || {};
  if (!listingId) {
    return res.status(400).json({ error: 'listingId is required' });
  }
  if (!integrationSdk) {
    return res.status(500).json({ error: 'Integration API is not configured on this server.' });
  }

  const sdk = getSdk(req, res);
  try {
    await sdk.ownListings.show({ id: listingId });
  } catch (e) {
    return res.status(403).json({ error: 'Only the listing owner can update the calendar.' });
  }

  try {
    const result = await reconcileListing(integrationSdk, listingId);
    return res.json(result);
  } catch (e) {
    return handleError(res, e);
  }
};
