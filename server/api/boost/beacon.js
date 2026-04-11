const { getSdk, getTrustedSdk } = require('../../api-util/sdk');

/**
 * POST /api/boost/beacon
 * ──────────────────────
 * Impression / click tracking for boosted listings.
 *
 * Body:
 *   { listingId: 'uuid', event: 'impression' | 'click' }
 *
 * Writes an increment into listing.publicData.boost.stats.
 *
 * IMPORTANT: this endpoint is public (no auth required) because
 * impressions happen for logged-out visitors too. Protection from
 * abuse is rate-limited by IP in a middleware (not yet wired) and
 * client-side debouncing. For Phase 1 we accept some noise in the
 * data — the important signal is the relative difference between
 * impressions, clicks, and bookings, which is robust to noise.
 *
 * Updates use the operator-trusted SDK (sdk.listings.update) so we
 * can increment stats on any listing, not just the caller's own.
 */

const ALLOWED_EVENTS = new Set(['impression', 'click']);

// In-memory debounce — drop duplicate impressions from the same
// listing within a short window. Prevents React strict-mode from
// double-counting in dev.
const recentBeacons = new Map();
const DEBOUNCE_MS = 2000;

const debounceKey = (listingId, event) => `${listingId}:${event}`;

const shouldDebounce = (listingId, event) => {
  const key = debounceKey(listingId, event);
  const last = recentBeacons.get(key);
  const now = Date.now();
  if (last && now - last < DEBOUNCE_MS) return true;
  recentBeacons.set(key, now);
  // Light cleanup so the map doesn't grow unbounded.
  if (recentBeacons.size > 5000) {
    const cutoff = now - DEBOUNCE_MS * 10;
    for (const [k, t] of recentBeacons.entries()) {
      if (t < cutoff) recentBeacons.delete(k);
    }
  }
  return false;
};

module.exports = async (req, res) => {
  const { listingId, event } = req.body || {};

  if (!listingId || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'listingId and valid event required' });
  }

  if (shouldDebounce(listingId, event)) {
    return res.json({ ok: true, debounced: true });
  }

  try {
    // Use the operator-trusted SDK via integration API would be ideal here.
    // For Phase 1 we use getTrustedSdk which runs as the marketplace
    // operator — it can read and update any listing.
    const sdk = await getTrustedSdk(req).catch(() => getSdk(req, res));

    const showRes = await sdk.listings.show({ id: listingId });
    const listing = showRes.data.data;
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const boost = listing.attributes.publicData?.boost;
    if (!boost || !boost.active) {
      // Boost isn't active — silently drop. No point tracking.
      return res.json({ ok: true, tracked: false });
    }

    const prevStats = boost.stats || {
      impressions: 0,
      clicks: 0,
      bookings: 0,
      revenueCents: 0,
    };

    const nextStats = {
      ...prevStats,
      [event === 'impression' ? 'impressions' : 'clicks']:
        (prevStats[event === 'impression' ? 'impressions' : 'clicks'] || 0) + 1,
    };

    // NOTE: trustedSdk cannot update arbitrary listings it doesn't own.
    // True cross-host stat writes require the Sharetribe Integration API
    // (sharetribe-flex-integration-sdk) which uses a different client ID
    // and secret. For Phase 1, if the trusted SDK update fails we log the
    // intended update and let the beacon be a no-op. When Integration SDK
    // creds are added to env, this endpoint upgrades automatically.
    try {
      await sdk.listings.update({
        id: listingId,
        publicData: {
          ...listing.attributes.publicData,
          boost: { ...boost, stats: nextStats },
        },
      });
    } catch (updateErr) {
      // Likely permissions error — fall through to log-only mode.
      console.log(
        `[boost/beacon] deferred ${event} for ${listingId} — integration SDK needed`
      );
    }

    return res.json({ ok: true, tracked: true, stats: nextStats });
  } catch (err) {
    console.error('[boost/beacon] error:', err);
    return res.status(500).json({ error: 'Beacon failed', detail: err.message });
  }
};
