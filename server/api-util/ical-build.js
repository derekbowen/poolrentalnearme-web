// VCALENDAR builder for per-listing feeds. Generic event titles only — NO renter
// names/phones/payment (feeds land in third-party CRMs; treat as semi-public).
// Event times are explicit UTC instants (DTSTART:...Z). They used to be
// TZID-qualified local times with an embedded VTIMEZONE; that is valid
// RFC 5545, but Swimply ignores TZID and read our 4-8 PM EDT booking as
// 16:00-20:00 UTC, i.e. 12-4 PM — leaving the real booked hours open there.
// UTC is the one form every consumer resolves identically (Swimply's own
// feed uses it). X-WR-TIMEZONE stays as a display hint only.
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

function vevent({ uid, start, end, summary }) {
  return [
    `BEGIN:VEVENT`,
    `UID:${uid}`,
    `DTSTAMP:${fmtUtc(new Date())}`,
    `DTSTART:${fmtUtc(start)}`,
    `DTEND:${fmtUtc(end)}`,
    `SUMMARY:${esc(summary)}`,
    `STATUS:CONFIRMED`,
    `TRANSP:OPAQUE`,
    `END:VEVENT`,
  ];
}

/**
 * @param bookings  [{ id, start, end, state }]  (bookings holding inventory:
 *                  accepted, or pending = request awaiting the host)
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
  ];
  for (const b of bookings) {
    lines.push(
      ...vevent({
        uid: `booking-${b.id}@poolrentalnearme.com`,
        start: b.start,
        end: b.end,
        // Same UID in both states, so acceptance updates the event in place.
        summary: b.state === 'pending' ? 'Requested (on hold)' : 'Booked',
      })
    );
  }
  for (const e of exceptions) {
    lines.push(
      ...vevent({
        uid: `exception-${e.id}@poolrentalnearme.com`,
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
