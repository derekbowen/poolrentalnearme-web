// VCALENDAR builder for per-listing feeds. Generic event titles only — NO renter
// names/phones/payment (feeds land in third-party CRMs; treat as semi-public).
// Times are emitted in the listing's local timezone with a real VTIMEZONE
// (US DST rules, which cover our market), never UTC-naive.
const moment = require('moment-timezone');

const pad = n => String(n).padStart(2, '0');

// iCal line folding: lines > 75 octets are folded with CRLF + a space.
function fold(line) {
  const out = [];
  let s = line;
  while (Buffer.byteLength(s, 'utf8') > 75) {
    // find a cut <= 75 bytes (conservative on multibyte)
    let cut = 75;
    while (Buffer.byteLength(s.slice(0, cut), 'utf8') > 75) cut--;
    out.push(s.slice(0, cut));
    s = ' ' + s.slice(cut);
  }
  out.push(s);
  return out.join('\r\n');
}

function esc(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// UTC stamp YYYYMMDDTHHMMSSZ
function fmtUtc(d) {
  const m = new Date(d);
  return (
    `${m.getUTCFullYear()}${pad(m.getUTCMonth() + 1)}${pad(m.getUTCDate())}T` +
    `${pad(m.getUTCHours())}${pad(m.getUTCMinutes())}${pad(m.getUTCSeconds())}Z`
  );
}

// Local wall-clock YYYYMMDDTHHMMSS in the listing tz (paired with TZID).
function fmtLocal(d, tz) {
  return moment.tz(d, tz).format('YYYYMMDDTHHmmss');
}

// A VTIMEZONE valid for US zones. Samples winter/summer offsets via moment-timezone;
// if they differ, emit STANDARD + DAYLIGHT with the standard US transition rules
// (DST: 2nd Sun Mar 02:00 -> 1st Sun Nov 02:00). No-DST zones (AZ, HI) get STANDARD only.
function buildVtimezone(tz) {
  const year = moment.tz(tz).year();
  const winter = moment.tz(`${year}-01-15`, tz);
  const summer = moment.tz(`${year}-07-15`, tz);
  const stdOffset = winter.utcOffset(); // minutes
  const dstOffset = summer.utcOffset();
  const stdName = winter.zoneAbbr();
  const dstName = summer.zoneAbbr();
  const offStr = mins => {
    const sign = mins < 0 ? '-' : '+';
    const a = Math.abs(mins);
    return `${sign}${pad(Math.floor(a / 60))}${pad(a % 60)}`;
  };
  const L = [`BEGIN:VTIMEZONE`, `TZID:${tz}`, `X-LIC-LOCATION:${tz}`];
  if (stdOffset === dstOffset) {
    L.push(
      `BEGIN:STANDARD`,
      `DTSTART:19700101T000000`,
      `TZOFFSETFROM:${offStr(stdOffset)}`,
      `TZOFFSETTO:${offStr(stdOffset)}`,
      `TZNAME:${stdName}`,
      `END:STANDARD`
    );
  } else {
    L.push(
      `BEGIN:DAYLIGHT`,
      `DTSTART:19700308T020000`,
      `RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU`,
      `TZOFFSETFROM:${offStr(stdOffset)}`,
      `TZOFFSETTO:${offStr(dstOffset)}`,
      `TZNAME:${dstName}`,
      `END:DAYLIGHT`,
      `BEGIN:STANDARD`,
      `DTSTART:19701101T020000`,
      `RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU`,
      `TZOFFSETFROM:${offStr(dstOffset)}`,
      `TZOFFSETTO:${offStr(stdOffset)}`,
      `TZNAME:${stdName}`,
      `END:STANDARD`
    );
  }
  L.push(`END:VTIMEZONE`);
  return L;
}

function vevent({ uid, tz, start, end, summary }) {
  return [
    `BEGIN:VEVENT`,
    `UID:${uid}`,
    `DTSTAMP:${fmtUtc(new Date())}`,
    `DTSTART;TZID=${tz}:${fmtLocal(start, tz)}`,
    `DTEND;TZID=${tz}:${fmtLocal(end, tz)}`,
    `SUMMARY:${esc(summary)}`,
    `STATUS:CONFIRMED`,
    `TRANSP:OPAQUE`,
    `END:VEVENT`,
  ];
}

/**
 * @param bookings  [{ id, start, end }]  (accepted bookings)
 * @param exceptions [{ id, start, end }] (seats:0 availability exceptions)
 */
function buildCalendar({ listingTitle, tz, bookings = [], exceptions = [] }) {
  const zone = moment.tz.zone(tz) ? tz : 'Etc/UTC';
  const lines = [
    `BEGIN:VCALENDAR`,
    `VERSION:2.0`,
    `PRODID:-//Pool Rental Near Me//Listing Calendar//EN`,
    `CALSCALE:GREGORIAN`,
    `METHOD:PUBLISH`,
    `X-WR-CALNAME:${esc((listingTitle || 'Pool') + ' — Bookings')}`,
    `X-WR-TIMEZONE:${zone}`,
    ...buildVtimezone(zone),
  ];
  for (const b of bookings) {
    lines.push(
      ...vevent({
        uid: `booking-${b.id}@poolrentalnearme.com`,
        tz: zone,
        start: b.start,
        end: b.end,
        summary: 'Booked',
      })
    );
  }
  for (const e of exceptions) {
    lines.push(
      ...vevent({
        uid: `exception-${e.id}@poolrentalnearme.com`,
        tz: zone,
        start: e.start,
        end: e.end,
        summary: 'Unavailable',
      })
    );
  }
  lines.push(`END:VCALENDAR`);
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { buildCalendar };
