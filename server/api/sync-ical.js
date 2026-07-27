const ical = require('node-ical');
const { getTrustedSdk, getSdk } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');

// Swimply typically keeps events up to 12 months out; mirror a full year
const SYNC_WINDOW_DAYS = 365;
const MAX_EXCEPTIONS_PER_SYNC = 200; // API hard cap guard
const FEED_FETCH_TIMEOUT_MS = 20000; // don't let a hanging feed wedge the request

/**
 * POST /api/sync-ical
 *
 * Fetches the host's Swimply iCal feed (stored in publicData.swimplyIcalUrl),
 * then creates availability exceptions (seats=0) in Sharetribe for every
 * event found within the next SYNC_WINDOW_DAYS days.
 *
 * Idempotent: each run creates new exceptions; existing ones are not deleted.
 * For a clean re-sync, delete old exceptions first via the Availability panel.
 *
 * Body (JSON): { listingId }
 * Auth: provider session (getSdk) — only the listing owner can sync.
 */
module.exports = async (req, res) => {
  const { listingId } = (req.body || {});

  if (!listingId) {
    return res.status(400).json({ error: 'listingId is required' });
  }

  // Use user-session SDK to verify ownership and fetch publicData
  const sdk = getSdk(req, res);

  let swimplyIcalUrl;
  try {
    const listingResp = await sdk.ownListings.show({
      id: listingId,
      'fields.ownListing': ['publicData'],
    });
    swimplyIcalUrl = listingResp?.data?.data?.attributes?.publicData?.swimplyIcalUrl;
  } catch (e) {
    return res.status(403).json({ error: 'Could not fetch listing — are you the owner?' });
  }

  if (!swimplyIcalUrl) {
    return res.status(400).json({
      reason: 'wrong_link',
      error: 'Save your Swimply calendar link first — paste it in the box above and click "Save URL", then Sync Now.',
    });
  }

  // The one thing that reliably tells a host they have the right link: the real
  // Swimply calendar FEED lives on admin.us.swimply.com and has "signed=" in it.
  // The public pool page (swimply.com/pooldetails/…) and the shared calendar view
  // (swimply.com/calendar/123) are WEB PAGES, not feeds — hosts paste those by
  // mistake. Lead the help with the recognition signal so a host can self-check
  // before they even hit Sync.
  const ICAL_HELP =
    'Your Swimply calendar feed link starts with "admin.us.swimply.com" and has ' +
    '"signed=" in it. To find it, log in at swimply.com in a web browser (not the ' +
    'app), open your pool’s Calendar, and look for a "Sync to external calendar" / ' +
    'iCal export option — then paste that link here.';

  // Early, fetch-free catch of the two web-page URLs hosts most often paste.
  // Match on host + path (not a loose substring) so the admin.us.swimply.com feed
  // URL — which also contains ".../calendar?..." — is never mis-flagged.
  try {
    const u = new URL(swimplyIcalUrl);
    const host = u.hostname.toLowerCase();
    const isPublicSwimplyHost = host === 'swimply.com' || host === 'www.swimply.com';
    if (isPublicSwimplyHost && /^\/pooldetails(\/|$)/i.test(u.pathname)) {
      return res.status(422).json({
        reason: 'wrong_link',
        error: `That looks like your Swimply pool page link, not your calendar feed. ${ICAL_HELP}`,
      });
    }
    if (isPublicSwimplyHost && /^\/calendar(\/|$)/i.test(u.pathname)) {
      return res.status(422).json({
        reason: 'wrong_link',
        error: `That looks like your Swimply pool page, not your calendar feed. ${ICAL_HELP}`,
      });
    }
  } catch (e) {
    // Not a parseable URL — the SSRF guard below returns the friendly message.
  }

  // SSRF guard: this URL is host-writable data and we fetch it server-side.
  // Only https URLs on swimply.com / *.swimply.com are ever fetched.
  let feedHostOk = false;
  try {
    const u = new URL(swimplyIcalUrl);
    const h = u.hostname.toLowerCase();
    feedHostOk = u.protocol === 'https:' && (h === 'swimply.com' || h.endsWith('.swimply.com'));
  } catch (e) {
    feedHostOk = false;
  }
  if (!feedHostOk) {
    return res.status(422).json({
      reason: 'wrong_link',
      error: `That doesn't look like a Swimply calendar link. ${ICAL_HELP}`,
    });
  }

  // Fetch the feed ONCE, then decide from the raw body whether it's a real
  // calendar or a web page. Fetching ourselves (instead of ical.fromURL) lets us
  // (a) sniff content-type + body for HTML and give a precise "that's a webpage"
  // message, and (b) apply a timeout so a hanging feed can't wedge the request.
  // Verified against all live Swimply feeds: parseICS(rawBody) yields the exact
  // same VEVENT set as the previous ical.fromURL path.
  let rawBody = '';
  let contentType = '';
  try {
    const r = await fetch(swimplyIcalUrl, {
      redirect: 'follow',
      headers: { Accept: 'text/calendar, text/plain, */*' },
      signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
    });
    contentType = (r.headers.get('content-type') || '').toLowerCase();
    rawBody = await r.text();
  } catch (e) {
    const detail = e && e.name === 'TimeoutError' ? 'the feed took too long to respond' : (e && e.message) || 'fetch failed';
    return res.status(422).json({
      reason: 'fetch_failed',
      error: `We couldn't load that calendar link (${detail}). Double-check the link, then try again. ${ICAL_HELP}`,
    });
  }

  // The decisive signal: a real iCal feed BEGINS with BEGIN:VCALENDAR (after an
  // optional BOM/whitespace). Anchoring to the start — rather than a loose
  // substring — means an HTML page that merely *mentions* the string (e.g. a
  // Swimply help page with a <code>BEGIN:VCALENDAR</code> example) is not mistaken
  // for a feed. When the body also looks like HTML, say so in the host's own words.
  const isFeed = /^\uFEFF?\s*BEGIN:VCALENDAR/i.test(rawBody);
  const looksHtml =
    contentType.includes('text/html') ||
    /^\s*<(!doctype html|html[\s>]|head[\s>]|body[\s>])/i.test(rawBody) ||
    (!isFeed && /<!doctype html|<html[\s>]/i.test(rawBody));
  if (!isFeed) {
    return res.status(422).json({
      reason: 'not_a_feed',
      error: looksHtml
        ? `That looks like a webpage, not a calendar feed. ${ICAL_HELP}`
        : `That link doesn't contain a calendar feed. ${ICAL_HELP}`,
    });
  }

  // Parse the already-fetched body (no second network call).
  let events;
  try {
    events = await ical.async.parseICS(rawBody);
  } catch (e) {
    return res.status(422).json({
      reason: 'not_a_feed',
      error: `That link doesn't contain a readable calendar feed. ${ICAL_HELP} (Details: ${e.message})`,
    });
  }
  const veventCount = Object.values(events).filter(ev => ev.type === 'VEVENT').length;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Filter to VEVENT entries in the sync window
  const toBlock = Object.values(events).filter(ev => {
    if (ev.type !== 'VEVENT') return false;
    const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
    const end = ev.end instanceof Date ? ev.end : new Date(ev.end);
    if (isNaN(start) || isNaN(end)) return false;
    // Overlaps with sync window
    return end > now && start < windowEnd;
  });

  // Swimply's feed labels real reservations "Swimply Booking NNN" and pads them
  // with "Swimply Buffer Time" events — count them separately so the host sees
  // "N bookings", not a confusing raw block count.
  const isBooking = ev => /booking/i.test(ev.summary || '');

  if (toBlock.length === 0) {
    return res.json({
      ok: true,
      blocked: 0,
      blockedBookings: 0,
      alreadyBlocked: 0,
      alreadyBookings: 0,
      feedEvents: veventCount,
      skipped: 0,
      message: 'No events found in sync window.',
    });
  }

  // Pre-filter events already covered by an existing exception (the host's own
  // block or a prior sync). Without this, a feed larger than the per-sync cap
  // re-attempts the SAME first 200 on every run (all 409s) and the tail never
  // imports — so "run Sync again" would be false advice. The pre-filter is an
  // optimization: if the query fails we fall back to attempting everything.
  let alreadyBlocked = 0;
  let alreadyBookings = 0;
  let uncovered = toBlock;
  try {
    let existing = [];
    let page = 1;
    while (page <= 5) {
      const eres = await integrationSdk.availabilityExceptions.query(
        { listingId, start: now, end: windowEnd, perPage: 100, page },
        { allowRawResponse: true }
      );
      const chunk = (((eres || {})._raw || {}).data || {}).data || [];
      existing = existing.concat(chunk);
      const tp = ((((eres || {})._raw || {}).data || {}).meta || {}).totalPages || 1;
      if (page >= tp || chunk.length === 0) break;
      page++;
    }
    if (existing.length > 0) {
      const covered = ev => {
        const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
        const en = ev.end instanceof Date ? ev.end : new Date(ev.end);
        return existing.some(x => {
          const a = x.attributes || {};
          return new Date(a.start) < en && new Date(a.end) > s;
        });
      };
      uncovered = [];
      for (const ev of toBlock) {
        if (covered(ev)) {
          alreadyBlocked++;
          if (isBooking(ev)) alreadyBookings++;
        } else {
          uncovered.push(ev);
        }
      }
    }
  } catch (e) {
    // never fail the sync over the pre-filter; 409 handling below still covers us
  }

  const limited = uncovered.slice(0, MAX_EXCEPTIONS_PER_SYNC);

  // Use trusted SDK (Integration API) to create exceptions — bypasses per-user rate limits.
  // Express 4 does not forward rejected async handlers to error middleware, so an
  // uncaught rejection here would hang the request — catch and answer instead.
  let trustedSdk;
  try {
    trustedSdk = await getTrustedSdk(req);
  } catch (e) {
    return res.status(500).json({ error: 'Could not authorize the sync — please refresh the page and try again.' });
  }

  let blocked = 0;
  let blockedBookings = 0;
  const errors = [];

  for (const ev of limited) {
    const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
    const end = ev.end instanceof Date ? ev.end : new Date(ev.end);
    try {
      await trustedSdk.availabilityExceptions.create(
        {
          listingId,
          seats: 0, // 0 = blocked
          start,
          end,
        },
        { expand: true }
      );
      blocked++;
      if (isBooking(ev)) blockedBookings++;
    } catch (e) {
      // Duplicate/overlapping exceptions are fine — Sharetribe returns 409. That
      // means the time is ALREADY blocked (prior sync or the host's own block):
      // count it so the UI can say "already up to date" instead of a bare "0".
      if (e?.status === 409) {
        alreadyBlocked++;
        if (isBooking(ev)) alreadyBookings++;
      } else {
        errors.push({ summary: ev.summary, error: e?.message || 'unknown' });
      }
    }
  }

  return res.json({
    ok: true,
    blocked,
    blockedBookings,
    alreadyBlocked,
    alreadyBookings,
    feedEvents: veventCount,
    skipped: uncovered.length - limited.length,
    errors: errors.length ? errors : undefined,
  });
};
