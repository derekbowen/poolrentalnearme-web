// Swimply (or any) iCal → Sharetribe availability-exception sync engine.
// A host pastes their Swimply iCal URL; we fetch it on a schedule, read their
// booked/busy dates, and blackout those dates on OUR calendar so they can't get
// double-booked. Opt-in per listing (publicData.icalSyncUrl).
//
// Idempotency: the exceptions WE create are tracked by id in
// publicData.icalSyncedExceptionIds. On each sync we delete the ones we made last
// time and recreate from the current feed — so cancelled Swimply bookings unblock,
// and host-created (manual) exceptions are never touched.
//
// Run:  node ical-swimply-sync.js --selftest
//       node ical-swimply-sync.js --url <ical> --listing <id> [--live]   (dry-run unless --live)

const SHARETRIBE_BASE = 'https://flex-integ-api.sharetribe.com';

// ---- iCal parsing (dependency-free; handles all-day DATE and DATE-TIME) ----
function unfold(text) {
  // RFC5545 line folding: continuation lines start with space/tab
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}
function parseICalDate(raw) {
  const v = (raw || '').trim();
  if (/^\d{8}$/.test(v)) {
    // all-day date → treat as full UTC day
    const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    return { iso: `${iso}T00:00:00.000Z`, dateOnly: true, day: iso };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000${m[7] ? 'Z' : 'Z'}`;
    return { iso, dateOnly: false, day: `${m[1]}-${m[2]}-${m[3]}` };
  }
  return null;
}
function parseICalBusyRanges(icalText) {
  const lines = unfold(icalText).split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    const t = line.trim();
    if (t === 'BEGIN:VEVENT') cur = {};
    else if (t === 'END:VEVENT') {
      if (cur && cur.start) {
        // If no DTEND, an all-day event lasts 1 day
        if (!cur.end && cur.start.dateOnly) {
          const d = new Date(cur.start.iso);
          d.setUTCDate(d.getUTCDate() + 1);
          cur.end = { iso: d.toISOString(), dateOnly: true, day: d.toISOString().slice(0, 10) };
        }
        if (cur.end) events.push(cur);
      }
      cur = null;
    } else if (cur) {
      const m = t.match(/^(DTSTART|DTEND|SUMMARY|STATUS)(;[^:]*)?:(.*)$/);
      if (!m) continue;
      const field = m[1];
      const val = m[3];
      if (field === 'DTSTART') cur.start = parseICalDate(val);
      else if (field === 'DTEND') cur.end = parseICalDate(val);
      else if (field === 'SUMMARY') cur.summary = val;
      else if (field === 'STATUS') cur.status = val;
    }
  }
  // Drop cancelled events; keep busy ones
  return events
    .filter(e => e.start && e.end && (e.status || '').toUpperCase() !== 'CANCELLED')
    .map(e => ({
      start: e.start.iso,
      end: e.end.iso,
      startDay: e.start.day,
      endDay: e.end.day,
      summary: e.summary || '(busy)',
    }));
}

// ---- Sharetribe Integration API (live mode only) ----
async function getToken() {
  const res = await fetch(`${SHARETRIBE_BASE}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHARETRIBE_CLI_API_KEY,
      client_secret: process.env.SHARETRIBE_CLI_API_SECRET,
      scope: 'integ',
    }),
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  return (await res.json()).access_token;
}
async function createException(token, listingId, range) {
  const res = await fetch(`${SHARETRIBE_BASE}/v1/integration_api/availability_exceptions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      listingId,
      start: range.start,
      end: range.end,
      seats: 0, // 0 seats = blocked/unavailable
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, errors: j.errors };
  return { ok: true, id: (j.data && (j.data.id.uuid || j.data.id)) };
}

async function syncFromUrl(url, listingId, { live = false } = {}) {
  const text = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`fetch ical ${r.status}`);
    return r.text();
  });
  const ranges = parseICalBusyRanges(text);
  console.log(`Parsed ${ranges.length} busy range(s) from iCal:`);
  ranges.forEach(r => console.log(`  - ${r.startDay} → ${r.endDay}  ${r.summary}`));
  if (!live) {
    console.log(`\nDRY-RUN: would create ${ranges.length} blackout exception(s) on listing ${listingId} (seats:0). Pass --live to apply.`);
    return { ranges, created: [] };
  }
  const token = await getToken();
  const created = [];
  for (const r of ranges) {
    const res = await createException(token, listingId, r);
    console.log(res.ok ? `  ✓ blocked ${r.startDay}→${r.endDay} (${res.id})` : `  ✗ ${r.startDay} FAILED ${res.status} ${JSON.stringify(res.errors).slice(0, 150)}`);
    if (res.ok) created.push(res.id);
  }
  return { ranges, created };
}

async function deleteException(token, id) {
  const res = await fetch(`${SHARETRIBE_BASE}/v1/integration_api/availability_exceptions/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ id }),
  });
  return res.ok;
}
async function saveSyncedIds(token, listingId, ids) {
  await fetch(`${SHARETRIBE_BASE}/v1/integration_api/listings/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ id: listingId, publicData: { icalSyncedExceptionIds: ids } }),
  });
}
async function listAllListings(token) {
  const all = [];
  let page = 1, pages = 1;
  do {
    const j = await fetch(
      `${SHARETRIBE_BASE}/v1/integration_api/listings/query?states=published,draft,pendingApproval,closed&perPage=100&page=${page}`,
      { headers: { Authorization: 'Bearer ' + token } }
    ).then(r => r.json());
    if (j.errors) throw new Error('query ' + JSON.stringify(j.errors).slice(0, 150));
    (j.data || []).forEach(l => all.push(l));
    pages = (j.meta || {}).totalPages || 1;
    page++;
  } while (page <= pages);
  return all;
}
// Idempotent per-listing sync: delete the exceptions we made last time, recreate
// from the current feed, and remember the new ids. Host-made exceptions untouched.
async function fullSyncListing(token, listing, { live }) {
  const id = (listing.id && listing.id.uuid) || listing.id;
  const a = listing.attributes || {};
  const pd = a.publicData || {};
  if (!pd.icalSyncUrl) return null;
  const text = await fetch(pd.icalSyncUrl).then(r => {
    if (!r.ok) throw new Error('ical ' + r.status);
    return r.text();
  });
  const ranges = parseICalBusyRanges(text);
  console.log(`[${(a.title || '').slice(0, 30)}] ${ranges.length} busy range(s) from feed`);
  if (!live) {
    ranges.forEach(r => console.log(`   would block ${r.startDay} → ${r.endDay}`));
    return { dryRun: true, ranges: ranges.length };
  }
  const prev = pd.icalSyncedExceptionIds || [];
  for (const eid of prev) await deleteException(token, eid);
  const created = [];
  for (const r of ranges) {
    const res = await createException(token, id, r);
    if (res.ok) created.push(res.id);
  }
  await saveSyncedIds(token, id, created);
  console.log(`   synced: -${prev.length} stale, +${created.length} new`);
  return { deleted: prev.length, created: created.length };
}
// Cron entrypoint: sync every opted-in listing.
async function runAll({ live }) {
  const token = await getToken();
  const all = await listAllListings(token);
  const opted = all.filter(l => ((l.attributes || {}).publicData || {}).icalSyncUrl);
  console.log(`${live ? 'LIVE' : 'DRY-RUN'}: ${opted.length} listing(s) with Swimply iCal sync enabled.`);
  for (const l of opted) {
    try { await fullSyncListing(token, l, { live }); }
    catch (e) { console.error('   sync error:', e.message); }
  }
}

// ---- self-test (deterministic, no network) ----
const SAMPLE_ICAL = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Swimply//Bookings//EN
BEGIN:VEVENT
UID:booking-1@swimply.com
SUMMARY:Swimply Booking - Pool Party
DTSTART:20260704T180000Z
DTEND:20260704T220000Z
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:holiday@swimply.com
SUMMARY:Blocked - Vacation
DTSTART;VALUE=DATE:20260712
DTEND;VALUE=DATE:20260715
END:VEVENT
BEGIN:VEVENT
UID:cancelled@swimply.com
SUMMARY:Cancelled booking
DTSTART:20260720T120000Z
DTEND:20260720T140000Z
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    console.log('=== SELF-TEST: parsing a sample Swimply-style iCal ===');
    const ranges = parseICalBusyRanges(SAMPLE_ICAL);
    console.log(JSON.stringify(ranges, null, 2));
    console.log(`\nExpected: 2 busy ranges (Jul 4 timed booking + Jul 12-15 all-day block); the CANCELLED one dropped.`);
    console.log(ranges.length === 2 ? 'PASS ✓' : 'FAIL ✗');
    return;
  }
  if (args.includes('--runall')) {
    await runAll({ live: args.includes('--live') });
    return;
  }
  const url = args[args.indexOf('--url') + 1];
  const listing = args[args.indexOf('--listing') + 1];
  const live = args.includes('--live');
  if (!url || !listing) {
    console.log('usage: node ical-swimply-sync.js --selftest | --url <ical> --listing <id> [--live]');
    return;
  }
  await syncFromUrl(url, listing, { live });
}
main().catch(e => console.error('ERR', e.message));
