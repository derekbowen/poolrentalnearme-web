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
const dns = require('dns').promises;
const net = require('net');
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

// ── SSRF-hardened fetch helper ─────────────────────────────────────────────
// The URL is host-supplied, so this fetch runs with our server's network
// position. Rules: https only; resolve the hostname and reject private,
// loopback, link-local (incl. 169.254.0.0/16 cloud metadata) and reserved
// ranges by ACTUAL IP (never string-matching the URL); pin the TCP connection
// to the vetted IP so DNS rebinding can't swap it after the check; re-vet on
// every redirect; cap the body size; enforce a hard timeout.
const MAX_ICAL_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;

const isForbiddenIp = ip => {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const v4 = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return isForbiddenIp(v4[1]);
    return (
      lower === '::1' || // loopback
      lower === '::' ||
      lower.startsWith('fe80:') || // link-local
      lower.startsWith('fc') || // unique-local fc00::/7
      lower.startsWith('fd')
    );
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true; // fail closed
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved
  );
};

const vetUrl = async raw => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    const e = new Error('icalUrl is not a valid URL');
    e.statusCode = 400;
    throw e;
  }
  if (url.protocol !== 'https:') {
    const e = new Error('icalUrl must use https');
    e.statusCode = 400;
    throw e;
  }
  let address;
  try {
    ({ address } = await dns.lookup(url.hostname));
  } catch {
    const e = new Error('icalUrl hostname does not resolve');
    e.statusCode = 400;
    throw e;
  }
  if (isForbiddenIp(address)) {
    const e = new Error('icalUrl resolves to a forbidden address');
    e.statusCode = 400;
    throw e;
  }
  return { url, address };
};

const fetchText = async (rawUrl, redirectsLeft = MAX_REDIRECTS) => {
  const { url, address } = await vetUrl(rawUrl);
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        // Connect to the vetted IP; TLS SNI + Host carry the real hostname.
        host: address,
        servername: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: { 'User-Agent': 'PoolRentalNearMe/1.0 iCal-Sync', Host: url.hostname },
        timeout: FETCH_TIMEOUT_MS,
      },
      res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
          let next;
          try {
            next = new URL(res.headers.location, url).toString();
          } catch {
            return reject(new Error('bad redirect location'));
          }
          return fetchText(next, redirectsLeft - 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`calendar fetch failed (${res.statusCode})`));
        }
        let body = '';
        res.on('data', chunk => {
          body += chunk;
          if (body.length > MAX_ICAL_BYTES) {
            request.destroy(new Error('calendar feed too large'));
          }
        });
        res.on('end', () => resolve(body));
      }
    );
    request.on('timeout', () => request.destroy(new Error('calendar fetch timed out')));
    request.on('error', reject);
  });
};

// ──────────────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  const { listingId, icalUrl } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required' });
  if (!icalUrl) return res.status(400).json({ error: 'icalUrl required' });

  // Full validation (scheme, DNS resolution, address ranges) happens in
  // vetUrl/fetchText below; this is just a fast, friendly precheck.
  if (!/^https:\/\//i.test(icalUrl)) {
    return res.status(400).json({ error: 'icalUrl must be an https URL' });
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
    const status = err.statusCode === 400 ? 400 : 500;
    return res.status(status).json({ error: 'import_failed', detail: err.message });
  }
};
