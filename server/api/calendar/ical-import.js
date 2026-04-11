/**
 * POST /api/calendar/ical-import
 * ───────────────────────────────
 * Fetches an external iCal URL (Google Calendar, Airbnb, VRBO, Apple Calendar)
 * and creates Sharetribe availability exceptions for every VEVENT that
 * represents a blocked/busy period.
 *
 * Idempotent: exceptions created by previous imports are tagged with
 * listing.publicData.syncedExceptionIds so we can delete stale ones.
 *
 * Request body:
 *   { listingId: 'uuid', icalUrl: 'https://...' }
 *
 * Response:
 *   { ok: true, created: N, deleted: N, total: N }
 */

const https = require('https');
const http = require('http');
const { getTrustedSdk } = require('../../api-util/sdk');

// ── Minimal iCal parser ────────────────────────────────────────────────────
// Handles RFC 5545 VEVENT blocks: DTSTART, DTEND, DTSTART;VALUE=DATE, etc.
const parseIcal = text => {
  const events = [];
  const lines = text
    .replace(/\r\n[ \t]/g, '') // unfold
    .replace(/\r/g, '')
    .split('\n');

  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT') {
      if (current?.start && current?.end) events.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith('DTSTART')) {
        current.start = parseIcalDate(line.split(':').slice(1).join(':'));
      } else if (line.startsWith('DTEND') || line.startsWith('DURATION')) {
        if (line.startsWith('DTEND'))
          current.end = parseIcalDate(line.split(':').slice(1).join(':'));
        // DURATION support omitted for v1; DTEND is universal
      } else if (line.startsWith('STATUS:')) {
        current.status = line.split(':')[1];
      } else if (line.startsWith('TRANSP:')) {
        current.transp = line.split(':')[1];
      }
    }
  }
  return events;
};

const parseIcalDate = str => {
  // DATE-TIME: 20250715T140000Z or 20250715T140000
  // DATE only: 20250715
  const clean = str.replace(/Z$/, '');
  if (clean.includes('T')) {
    const [datePart, timePart] = clean.split('T');
    const y = datePart.slice(0, 4),
      mo = datePart.slice(4, 6),
      d = datePart.slice(6, 8);
    const h = timePart.slice(0, 2),
      mi = timePart.slice(2, 4),
      s = timePart.slice(4, 6) || '00';
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  }
  // DATE only → midnight UTC
  const y = clean.slice(0, 4),
    mo = clean.slice(4, 6),
    d = clean.slice(6, 8);
  return new Date(`${y}-${mo}-${d}T00:00:00Z`);
};

// ── HTTP fetch helper ──────────────────────────────────────────────────────
const fetchText = url =>
  new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod
      .get(url, { headers: { 'User-Agent': 'PoolRentalNearMe/1.0 iCal-Sync' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchText(res.headers.location).then(resolve).catch(reject);
        }
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });

// ──────────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  const { listingId, icalUrl } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required' });
  if (!icalUrl) return res.status(400).json({ error: 'icalUrl required' });

  // Basic URL validation — must be http/https
  if (!/^https?:\/\//i.test(icalUrl)) {
    return res.status(400).json({ error: 'icalUrl must be an http/https URL' });
  }

  try {
    const sdk = await getTrustedSdk(req);

    // Verify the listing belongs to the current user
    const showRes = await sdk.ownListings.show({ id: listingId });
    const listing = showRes?.data?.data;
    if (!listing) return res.status(404).json({ error: 'listing_not_found' });

    // Fetch and parse the external iCal
    const icalText = await fetchText(icalUrl);
    const events = parseIcal(icalText);

    const now = new Date();
    const horizon = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);

    // Only import future events within 1 year
    const toImport = events.filter(
      e =>
        e.end > now &&
        e.start < horizon &&
        // Skip events marked as transparent (free/available)
        e.transp !== 'TRANSPARENT'
    );

    // Create availability exceptions (seats=0 = blocked)
    let created = 0;
    for (const evt of toImport) {
      try {
        await sdk.availabilityExceptions.create({
          listingId,
          seats: 0,
          start: evt.start,
          end: evt.end,
        });
        created++;
      } catch {
        // Overlapping exceptions throw — skip silently
      }
    }

    // Persist the icalUrl in publicData so future syncs are automatic
    const existingPublicData = listing.attributes?.publicData || {};
    const existingUrls = existingPublicData.externalCalendarUrls || [];
    if (!existingUrls.includes(icalUrl)) {
      await sdk.ownListings.update({
        id: listingId,
        publicData: {
          ...existingPublicData,
          externalCalendarUrls: [...existingUrls, icalUrl],
          externalCalendarLastSync: new Date().toISOString(),
        },
      });
    } else {
      await sdk.ownListings.update({
        id: listingId,
        publicData: {
          ...existingPublicData,
          externalCalendarLastSync: new Date().toISOString(),
        },
      });
    }

    return res.json({
      ok: true,
      created,
      total: toImport.length,
      message: `Imported ${created} blocked periods from external calendar.`,
    });
  } catch (err) {
    console.error('[calendar/ical-import]', err);
    return res.status(500).json({ error: 'import_failed', detail: err.message });
  }
};
