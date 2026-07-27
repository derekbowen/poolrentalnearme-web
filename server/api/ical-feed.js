// GET /api/ical/:listingId/:token.ics  — PUBLIC, token-authorized, read-only.
// Emits a VCALENDAR of this listing's accepted bookings + seats:0 exceptions,
// generic titles only, in the listing timezone. 10-minute in-memory cache.
const integrationSdk = require('../api-util/integration');
const icalToken = require('../api-util/icalToken');
const { icalEnabledFor } = require('../api-util/icalFlag');
const { buildCalendar } = require('../api-util/ical-build');

const WINDOW_DAYS = 365;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // key `${listingId}:${version}` -> { at, ics }

const notFound = res => res.status(404).type('text/plain').send('Not found');

// Accepted bookings for a listing. The Integration API has NO bookings/query
// endpoint (404s) — bookings are only reachable embedded in transactions, so
// we page transactions.query({ listingId, include: ['booking'] }) and filter
// to accepted bookings overlapping the window. Same pattern as
// listing-booked-dates.js.
async function fetchAcceptedBookings(listingId, start, end) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await integrationSdk.transactions.query(
      { listingId, include: ['booking'], perPage: 100, page },
      { allowRawResponse: true }
    );
    const raw = (res._raw || res).data;
    totalPages = (raw.meta && raw.meta.totalPages) || 1;
    for (const b of (raw.included || []).filter(i => i.type === 'booking')) {
      const a = b.attributes || {};
      if (a.state !== 'accepted' || !a.start || !a.end) continue;
      const bs = new Date(a.start);
      const be = new Date(a.end);
      if (be <= start || bs >= end) continue;
      out.push({ id: (b.id && b.id.uuid) || b.id, start: a.start, end: a.end });
    }
    page++;
  } while (page <= totalPages && page <= 20);
  return out;
}

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

    let bookings = [];
    try {
      bookings = await fetchAcceptedBookings(listingId, start, end);
    } catch (be) {
      console.error('[ical-feed] bookings read failed:', be && be.message);
      bookings = []; // still emit exceptions so the feed is never empty on a bookings hiccup
    }

    let exceptions = [];
    try {
      const eres = await integrationSdk.availabilityExceptions.query(
        { listingId, start, end },
        { allowRawResponse: true }
      );
      exceptions = ((eres._raw.data.data) || [])
        .filter(e => e.attributes && e.attributes.seats === 0 && e.attributes.start && e.attributes.end)
        .map(e => ({ id: e.id.uuid, start: e.attributes.start, end: e.attributes.end }));
    } catch {
      exceptions = []; // exceptions are best-effort; still emit bookings
    }

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
