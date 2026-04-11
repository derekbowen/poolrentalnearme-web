/**
 * GET /api/calendar/ical/:listingId
 * ──────────────────────────────────
 * Public iCal feed for a listing. Returns a .ics file containing:
 *   - Blocked dates (seats=0 exceptions) as VEVENT entries
 *   - Subscribable in Google Calendar, Apple Calendar, Outlook, etc.
 *
 * The listing ID acts as the "secret" for the feed URL — no auth needed.
 * Hosts share this link so guests (or their own calendars) stay in sync.
 */

const { getTrustedSdk } = require('../../api-util/sdk');

// Formats a JS Date to iCal UTC date string: 20250101T120000Z
const icalDate = date => {
  return new Date(date)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
};

const uid = (type, id) => `${type}-${id}@poolrentalnearme.com`;

// Fold long lines per RFC 5545 (max 75 octets)
const fold = str =>
  str
    .split('\r\n')
    .flatMap(line => {
      if (line.length <= 75) return [line];
      const chunks = [];
      let i = 0;
      chunks.push(line.slice(0, 75));
      i = 75;
      while (i < line.length) {
        chunks.push(' ' + line.slice(i, i + 74));
        i += 74;
      }
      return chunks;
    })
    .join('\r\n');

module.exports = async (req, res) => {
  const { listingId } = req.params;
  if (!listingId) return res.status(400).send('listingId required');

  try {
    const sdk = await getTrustedSdk(req);

    const listingRes = await sdk.listings.show({ id: listingId });
    const listing = listingRes?.data?.data;
    if (!listing) return res.status(404).send('Listing not found');

    const title = listing.attributes?.title || 'Pool Rental';

    const now = new Date();
    const horizon = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);

    const exceptionsRes = await sdk.availabilityExceptions.query({
      listingId,
      start: now,
      end: horizon,
    });
    const exceptions = (exceptionsRes?.data?.data || []).filter(
      e => e.attributes.seats === 0
    );

    const events = exceptions.map(e => {
      const start = icalDate(e.attributes.start);
      const end = icalDate(e.attributes.end);
      return [
        'BEGIN:VEVENT',
        `UID:${uid('blocked', e.id)}`,
        `DTSTAMP:${icalDate(new Date())}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${title} — Unavailable`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      ].join('\r\n');
    });

    const ical = fold(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Pool Rental Near Me//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${title}`,
        'X-WR-TIMEZONE:UTC',
        ...events,
        'END:VCALENDAR',
      ].join('\r\n')
    );

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${listingId}.ics"`
    );
    return res.send(ical);
  } catch (err) {
    console.error('[calendar/ical-export]', err);
    return res.status(500).json({ error: 'export_failed', detail: err.message });
  }
};
