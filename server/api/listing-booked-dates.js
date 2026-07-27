const { getSdk } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');

/**
 * POST /api/listing-booked-dates  { listingId }
 * Returns { dates: ['YYYY-MM-DD', ...] } — the days that have an ACCEPTED
 * booking on this listing (next ~12 months), so the host calendar can mark
 * them. Owner-gated. Non-fatal: returns [] on any query problem so the
 * calendar still renders.
 *
 * NOTE: the Integration API has NO bookings/query endpoint (404s) — bookings
 * are only reachable embedded in transactions, so we page
 * transactions.query({ listingId, include: ['booking'] }) and filter to
 * accepted bookings overlapping the window. Same pattern as ical-feed.js.
 */
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

module.exports = async (req, res) => {
  const { listingId } = req.body || {};
  if (!listingId) {
    return res.status(400).json({ error: 'listingId is required' });
  }

  const sdk = getSdk(req, res);
  try {
    // Ownership check — only the listing owner may read this.
    await sdk.ownListings.show({ id: listingId });
  } catch (e) {
    return res.status(403).json({ error: 'Could not verify listing ownership.' });
  }

  try {
    const start = new Date();
    const end = new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);
    const bookings = await fetchAcceptedBookings(listingId, start, end);
    const dates = new Set();
    bookings.forEach(b => {
      const s = b.start ? new Date(b.start) : null;
      const e = b.end ? new Date(b.end) : null;
      if (!s || !e || isNaN(s) || isNaN(e)) return;
      for (let d = new Date(s); d < e; d.setUTCDate(d.getUTCDate() + 1)) {
        dates.add(d.toISOString().slice(0, 10));
      }
      // Same-day (hourly) bookings: ensure the start day is included.
      dates.add(s.toISOString().slice(0, 10));
    });
    return res.json({ dates: Array.from(dates) });
  } catch (e) {
    // Don't break the calendar if bookings can't be read.
    // eslint-disable-next-line no-console
    console.warn('[listing-booked-dates] read failed:', e.message);
    return res.json({ dates: [] });
  }
};
