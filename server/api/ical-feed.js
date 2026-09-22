// GET /api/ical/:listingId/:token.ics  — PUBLIC, token-authorized, read-only.
// Emits a VCALENDAR of everything holding this listing's inventory — pending
// and accepted bookings + seats:0 exceptions, every page — as UTC instants,
// generic titles only. 10-minute in-memory cache.
const integrationSdk = require('../api-util/integration');
const icalToken = require('../api-util/icalToken');
const { icalEnabledFor } = require('../api-util/icalFlag');
const { buildCalendar } = require('../api-util/ical-build');
const { fetchHoldingBookings, fetchBlockingExceptions } = require('../api-util/ical-sources');

const WINDOW_DAYS = 365;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // key `${listingId}:${version}` -> { at, ics }

const notFound = res => res.status(404).type('text/plain').send('Not found');

// Self-contained rate limiter: max 60 requests / 5 min per (ip+listing).
const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 60;
const rlHits = new Map(); // key -> [timestamps]
function rateLimited(req) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const key = `${ip}|${req.params.listingId}`;
  const now = Date.now();
  const arr = (rlHits.get(key) || []).filter(t => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(key, arr);
  if (rlHits.size > 5000) { for (const k of rlHits.keys()) { rlHits.delete(k); if (rlHits.size <= 2500) break; } }
  return arr.length > RL_MAX;
}

module.exports = async (req, res) => {
  if (rateLimited(req)) return res.status(429).type('text/plain').send('Too many requests');
  const { listingId } = req.params;
  const token = String(req.params.token || '').replace(/\.ics$/i, '');

  if (!icalToken.configured() || !integrationSdk || !listingId || !token) {
    return notFound(res);
  }

  try {
    // Load listing: timezone, token version, author (for allowlist), title.
    let listing;
    try {
      const lres = await integrationSdk.listings.show({ id: listingId }, { allowRawResponse: true });
      listing = lres._raw.data.data;
    } catch {
      return notFound(res); // unknown listing -> 404 (don't confirm existence)
    }
    const attrs = listing.attributes || {};
    const pd = attrs.publicData || {};
    const tz = (attrs.availabilityPlan || {}).timezone || 'Etc/UTC';
    const version = Number.isInteger(pd.icalTokenVersion) ? pd.icalTokenVersion : icalToken.DEFAULT_VERSION;
    const authorId =
      listing.relationships &&
      listing.relationships.author &&
      listing.relationships.author.data &&
      listing.relationships.author.data.id.uuid;

    // Feature flag + token check. Both failures -> identical 404.
    if (!icalEnabledFor({ listingId, authorId })) return notFound(res);
    if (!icalToken.verify(listingId, version, token)) return notFound(res);

    // Cache
    const key = `${listingId}:${version}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      res.set('Cache-Control', 'public, max-age=600');
      res.set('ETag', `"${key}-${hit.at}"`);
      return res.type('text/calendar; charset=utf-8').send(hit.ics);
    }

    const start = new Date();
    const end = new Date(start.getTime() + WINDOW_DAYS * 86400000);

    // Both reads must be complete. A partial calendar is worse than none: an
    // external calendar treats a missing block as bookable. So a failed or
    // truncated read fails the request (500) and consumers keep their last
    // good copy, instead of receiving a feed with holes in it.
    const [bookings, exceptions] = await Promise.all([
      fetchHoldingBookings(integrationSdk, listingId, start, end),
      fetchBlockingExceptions(integrationSdk, listingId, start, end),
    ]);

    const ics = buildCalendar({ listingTitle: attrs.title, tz, bookings, exceptions });
    cache.set(key, { at: Date.now(), ics });

    res.set('Cache-Control', 'public, max-age=600');
    res.set('ETag', `"${key}-${Date.now()}"`);
    res.set('Content-Disposition', 'inline; filename="pool-calendar.ics"');
    return res.type('text/calendar; charset=utf-8').send(ics);
  } catch (e) {
    console.error('[ical-feed]', e && e.message);
    return res.status(500).type('text/plain').send('Error generating calendar');
  }
};
