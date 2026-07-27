const moment = require('moment-timezone');
const { getSdk, handleError } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');

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
 * Idempotent: deletes the exceptions WE made last time (tracked in
 * publicData.availability.calendarExceptionIds) and recreates from the current
 * overrides. The host's own manual exceptions are never touched.
 *
 * Server reads the overrides from the listing itself (server-trusted). Owner-gated.
 * Run AFTER the panel has saved publicData.availability.dateOverrides.
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
  let listing;
  try {
    const r = await sdk.ownListings.show({ id: listingId });
    listing = r.data.data;
  } catch (e) {
    return res.status(403).json({ error: 'Only the listing owner can update the calendar.' });
  }

  const attrs = listing.attributes || {};
  const pd = attrs.publicData || {};
  const availability = pd.availability || {};
  const overrides = availability.dateOverrides || {};
  const prevIds = availability.calendarExceptionIds || {};
  const tz = (attrs.availabilityPlan && attrs.availabilityPlan.timezone) || 'Etc/UTC';

  try {
    // 1) Remove the exceptions we created last time (idempotent re-sync).
    const allPrev = Object.keys(prevIds).reduce((acc, d) => acc.concat(prevIds[d] || []), []);
    for (const id of allPrev) {
      try {
        await integrationSdk.availabilityExceptions.delete({ id });
      } catch (e) {
        /* already gone — ignore */
      }
    }

    // 2) Create fresh exceptions from the current per-day overrides.
    const newIds = {};
    for (const date of Object.keys(overrides)) {
      const o = overrides[date] || {};
      const dayStart = moment.tz(`${date} 00:00`, 'YYYY-MM-DD HH:mm', tz);
      const dayEnd = dayStart.clone().add(1, 'day');
      const ranges = [];

      if (o.closed) {
        ranges.push([dayStart.toDate(), dayEnd.toDate()]);
      } else {
        // Edge-trim: block the parts of the day outside the host's open–close window.
        if (
          Number.isInteger(o.open) &&
          Number.isInteger(o.close) &&
          o.close > o.open &&
          (o.open > 0 || o.close < 24)
        ) {
          if (o.open > 0) ranges.push([dayStart.toDate(), dayStart.clone().hour(o.open).toDate()]);
          if (o.close < 24) ranges.push([dayStart.clone().hour(o.close).toDate(), dayEnd.toDate()]);
        }
        // Interior blocks: block specific hour ranges while the rest stays open,
        // e.g. [[20,21]] blocks 8pm–9pm but keeps 7pm and 9pm bookable.
        if (Array.isArray(o.blocks)) {
          for (const b of o.blocks) {
            if (!Array.isArray(b) || b.length !== 2) continue;
            const s = b[0];
            const e = b[1];
            if (!Number.isInteger(s) || !Number.isInteger(e) || e <= s || s < 0 || e > 24) continue;
            const start = dayStart.clone().hour(s).toDate();
            const end = e >= 24 ? dayEnd.toDate() : dayStart.clone().hour(e).toDate();
            ranges.push([start, end]);
          }
        }
      }

      const ids = [];
      for (const [start, end] of ranges) {
        try {
          const cr = await integrationSdk.availabilityExceptions.create({
            listingId,
            seats: 0,
            start,
            end,
          });
          const id = cr && cr.data && cr.data.data && (cr.data.data.id.uuid || cr.data.data.id);
          if (id) ids.push(id);
        } catch (e) {
          /* skip this range */
        }
      }
      if (ids.length) newIds[date] = ids;
    }

    // 3) Remember what we created so the next save can reconcile.
    await integrationSdk.listings.update({
      id: listingId,
      publicData: { availability: { ...availability, calendarExceptionIds: newIds } },
    });

    return res.json({ ok: true, blockedDates: Object.keys(newIds).length });
  } catch (e) {
    return handleError(res, e);
  }
};
