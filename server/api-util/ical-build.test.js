const moment = require('moment-timezone');
const { buildCalendar } = require('./ical-build');
const { fetchHoldingBookings, fetchBlockingExceptions } = require('./ical-sources');

// ---------------------------------------------------------------------------
// Two independent readers of the generated ICS.
//
// naiveRead: what a TZID-ignoring consumer does (Swimply, observed in
// production: a 4-8 PM EDT booking showed as 12-4 PM). It reads the digits
// after the colon as UTC, and honors a trailing Z.
//
// strictRead: an RFC 5545 reader for the forms we emit — UTC (Z) or
// TZID-qualified local time, resolved through the IANA zone database.
//
// The feed is correct only if BOTH return the Sharetribe instant.
// ---------------------------------------------------------------------------
const unfold = ics => ics.replace(/\r\n[ \t]/g, '');

const events = ics =>
  unfold(ics)
    .split('BEGIN:VEVENT')
    .slice(1)
    .map(chunk => {
      const prop = name => {
        const m = chunk.match(new RegExp(`\\r\\n${name}([^:\\r\\n]*):([^\\r\\n]+)`));
        return m ? { params: m[1], value: m[2] } : null;
      };
      return {
        uid: (prop('UID') || {}).value,
        summary: (prop('SUMMARY') || {}).value,
        start: prop('DTSTART'),
        end: prop('DTEND'),
      };
    });

const digits = v => v.replace(/Z$/, '');
const naiveRead = p => moment.utc(digits(p.value), 'YYYYMMDDTHHmmss').toISOString();
const strictRead = p => {
  const tzid = (p.params.match(/TZID=([^;:]+)/) || [])[1];
  if (p.value.endsWith('Z')) return moment.utc(digits(p.value), 'YYYYMMDDTHHmmss').toISOString();
  if (tzid) return moment.tz(p.value, 'YYYYMMDDTHHmmss', tzid).toISOString();
  throw new Error(`floating time with no TZID: ${p.value}`);
};

const iso = s => new Date(s).toISOString();
const localOf = (instant, tz) => moment.tz(instant, tz).format('YYYY-MM-DD HH:mm');

function roundTrip({ tz, start, end }) {
  const ics = buildCalendar({ listingTitle: 'Pool', tz, bookings: [{ id: 'b1', start, end }] });
  const [ev] = events(ics);
  return { ics, ev };
}

describe('ICS event times are explicit UTC instants', () => {
  it('reproduces the real Ledyard case: Jul 31 2026 4-8 PM America/New_York', () => {
    // Sharetribe booking: 2026-07-31T20:00Z .. 2026-08-01T00:00Z
    const { ics, ev } = roundTrip({
      tz: 'America/New_York',
      start: '2026-07-31T20:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    });
    expect(ics).toContain('\r\nDTSTART:20260731T200000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20260801T000000Z\r\n');
    // A TZID-ignoring consumer (Swimply) now lands on the right instant...
    expect(naiveRead(ev.start)).toBe('2026-07-31T20:00:00.000Z');
    expect(naiveRead(ev.end)).toBe('2026-08-01T00:00:00.000Z');
    // ...which is 4:00 PM - 8:00 PM Eastern, not 12:00 PM - 4:00 PM.
    expect(localOf(naiveRead(ev.start), 'America/New_York')).toBe('2026-07-31 16:00');
    expect(localOf(naiveRead(ev.end), 'America/New_York')).toBe('2026-07-31 20:00');
  });

  it('never emits TZID-qualified or floating times', () => {
    const { ics } = roundTrip({
      tz: 'America/Los_Angeles',
      start: '2026-07-31T21:30:00.000Z',
      end: '2026-07-31T23:00:00.000Z',
    });
    expect(ics).not.toMatch(/DTSTART;TZID=/);
    expect(ics).not.toMatch(/DTEND;TZID=/);
    for (const line of unfold(ics).split('\r\n')) {
      if (/^DT(START|END)/.test(line)) expect(line).toMatch(/^DT(START|END):\d{8}T\d{6}Z$/);
    }
  });

  // [zone, local start, local end] — :00 and :30 boundaries, standard and
  // daylight time, and both US DST transition days.
  const CASES = [
    ['America/New_York', '2026-01-15 10:00', '2026-01-15 12:30'], // EST
    ['America/New_York', '2026-07-31 16:00', '2026-07-31 20:00'], // EDT
    ['America/New_York', '2026-09-24 19:30', '2026-09-24 21:00'], // EDT :30
    ['America/Chicago', '2026-02-10 09:30', '2026-02-10 11:00'], // CST
    ['America/Chicago', '2026-06-20 13:00', '2026-06-20 15:30'], // CDT
    ['America/Denver', '2026-12-05 11:00', '2026-12-05 13:00'], // MST
    ['America/Denver', '2026-08-08 17:30', '2026-08-08 19:30'], // MDT
    ['America/Phoenix', '2026-07-04 14:30', '2026-07-04 16:00'], // MST, no DST
    ['America/Los_Angeles', '2026-01-20 08:00', '2026-01-20 10:30'], // PST
    ['America/Los_Angeles', '2026-07-31 14:30', '2026-07-31 18:00'], // PDT
    // Spring forward: 2026-03-08, 02:00 -> 03:00 local.
    ['America/New_York', '2026-03-08 00:30', '2026-03-08 04:30'],
    ['America/Los_Angeles', '2026-03-07 22:00', '2026-03-08 06:00'],
    // Fall back: 2026-11-01, 02:00 -> 01:00 local.
    ['America/New_York', '2026-10-31 23:00', '2026-11-01 03:30'],
    ['America/Chicago', '2026-11-01 00:00', '2026-11-01 04:00'],
    // Midnight crossing.
    ['America/New_York', '2026-08-03 22:00', '2026-08-04 00:00'],
  ];

  it.each(CASES)('%s %s → %s survives instant → ICS → parser → local', (tz, ls, le) => {
    const start = moment.tz(ls, 'YYYY-MM-DD HH:mm', tz).toISOString();
    const end = moment.tz(le, 'YYYY-MM-DD HH:mm', tz).toISOString();
    const { ev } = roundTrip({ tz, start, end });
    for (const read of [naiveRead, strictRead]) {
      expect(read(ev.start)).toBe(iso(start));
      expect(read(ev.end)).toBe(iso(end));
      expect(localOf(read(ev.start), tz)).toBe(ls);
      expect(localOf(read(ev.end), tz)).toBe(le);
    }
  });

  it('keeps the exact instant across the fall-back repeated hour', () => {
    // 01:30 happens twice on 2026-11-01 in New York; both instants must survive.
    const first = '2026-11-01T05:30:00.000Z'; // 01:30 EDT
    const second = '2026-11-01T06:30:00.000Z'; // 01:30 EST
    const ics = buildCalendar({
      tz: 'America/New_York',
      exceptions: [
        { id: 'e1', start: first, end: '2026-11-01T06:00:00.000Z' },
        { id: 'e2', start: second, end: '2026-11-01T07:00:00.000Z' },
      ],
    });
    const [a, b] = events(ics);
    expect(naiveRead(a.start)).toBe(first);
    expect(naiveRead(b.start)).toBe(second);
  });

  it('is correct for an unknown/missing listing timezone', () => {
    const ics = buildCalendar({
      tz: undefined,
      bookings: [{ id: 'b', start: '2026-07-31T20:00:00.000Z', end: '2026-08-01T00:00:00.000Z' }],
    });
    expect(ics).toContain('\r\nDTSTART:20260731T200000Z\r\n');
  });
});

describe('ICS content', () => {
  it('labels pending requests distinctly from confirmed bookings, with stable UIDs', () => {
    const ics = buildCalendar({
      tz: 'America/New_York',
      bookings: [
        { id: 'acc', start: '2026-08-01T15:00:00Z', end: '2026-08-01T17:00:00Z', state: 'accepted' },
        { id: 'pen', start: '2026-08-02T15:00:00Z', end: '2026-08-02T17:00:00Z', state: 'pending' },
      ],
    });
    const evs = events(ics);
    expect(evs.map(e => [e.uid, e.summary])).toEqual([
      ['booking-acc@poolrentalnearme.com', 'Booked'],
      ['booking-pen@poolrentalnearme.com', 'Requested (on hold)'],
    ]);
  });

  it('keeps generic titles only (no guest data)', () => {
    const ics = buildCalendar({
      tz: 'America/New_York',
      bookings: [{ id: 'x', start: '2026-08-01T15:00:00Z', end: '2026-08-01T17:00:00Z', guestName: 'Jane' }],
    });
    expect(ics).not.toContain('Jane');
  });
});

// ---------------------------------------------------------------------------
// Sources: paging and inventory-holding states, against a fake SDK.
// ---------------------------------------------------------------------------
const pagedExceptionsSdk = (total, seatsFor = () => 0) => {
  const all = Array.from({ length: total }, (_, i) => ({
    id: { uuid: `ex-${i + 1}` },
    attributes: {
      seats: seatsFor(i),
      start: new Date(Date.UTC(2027, 0, 1, 0, 0) + i * 3600e3).toISOString(),
      end: new Date(Date.UTC(2027, 0, 1, 1, 0) + i * 3600e3).toISOString(),
    },
  }));
  const calls = [];
  return {
    calls,
    availabilityExceptions: {
      query: async params => {
        calls.push(params);
        // Mirror Sharetribe: default page size 100 when perPage is omitted.
        const per = params.perPage || 100;
        const page = params.page || 1;
        return {
          _raw: {
            data: {
              data: all.slice((page - 1) * per, page * per),
              meta: { totalItems: total, totalPages: Math.ceil(total / per), page, perPage: per },
            },
          },
        };
      },
    },
  };
};

describe('fetchBlockingExceptions()', () => {
  const S = new Date('2026-09-22T00:00:00Z');
  const E = new Date('2027-09-22T00:00:00Z');

  it('returns records 101+ (165 blocks, as on the real Off The Hwy Pool listing)', async () => {
    const sdk = pagedExceptionsSdk(165);
    const out = await fetchBlockingExceptions(sdk, 'L', S, E);
    expect(out).toHaveLength(165);
    expect(out.map(e => e.id)).toContain('ex-101');
    expect(out.map(e => e.id)).toContain('ex-165');
    expect(sdk.calls.map(c => c.page)).toEqual([1, 2]);
  });

  it('carries records 101+ all the way into the ICS', async () => {
    const out = await fetchBlockingExceptions(pagedExceptionsSdk(250), 'L', S, E);
    const ics = buildCalendar({ tz: 'America/New_York', exceptions: out });
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(250);
    expect(ics).toContain('UID:exception-ex-101@poolrentalnearme.com');
    expect(ics).toContain('UID:exception-ex-250@poolrentalnearme.com');
  });

  it('only exports seats:0 exceptions', async () => {
    const out = await fetchBlockingExceptions(pagedExceptionsSdk(10, i => (i % 2 ? 1 : 0)), 'L', S, E);
    expect(out).toHaveLength(5);
  });
});

const txSdk = pages => ({
  transactions: {
    query: async params => {
      const page = params.page || 1;
      const bookings = pages[page - 1] || [];
      return {
        _raw: {
          data: {
            data: bookings.map((_, i) => ({ id: { uuid: `tx-${page}-${i}` }, type: 'transaction' })),
            included: bookings.map(([id, state, start, end]) => ({
              id: { uuid: id },
              type: 'booking',
              attributes: { state, start, end },
            })),
            meta: { totalPages: pages.length, page },
          },
        },
      };
    },
  },
});

describe('fetchHoldingBookings()', () => {
  const S = new Date('2026-09-22T00:00:00Z');
  const E = new Date('2027-09-22T00:00:00Z');
  const slot = h => [`2026-10-01T${h}:00:00.000Z`, `2026-10-01T${h}:59:00.000Z`];

  it('exports pending and accepted bookings; drops declined/cancelled/proposed', async () => {
    const sdk = txSdk([
      [
        ['acc', 'accepted', ...slot('10')],
        ['pen', 'pending', ...slot('11')],
        ['dec', 'declined', ...slot('12')], // expired or declined request
        ['can', 'cancelled', ...slot('13')],
        ['pro', 'proposed', ...slot('14')],
      ],
    ]);
    const out = await fetchHoldingBookings(sdk, 'L', S, E);
    expect(out.map(b => [b.id, b.state])).toEqual([
      ['acc', 'accepted'],
      ['pen', 'pending'],
    ]);
  });

  it('a request that stops holding inventory disappears from the next feed', async () => {
    const before = await fetchHoldingBookings(txSdk([[['r1', 'pending', ...slot('10')]]]), 'L', S, E);
    const after = await fetchHoldingBookings(txSdk([[['r1', 'declined', ...slot('10')]]]), 'L', S, E);
    expect(buildCalendar({ tz: 'America/New_York', bookings: before })).toContain('booking-r1@');
    expect(buildCalendar({ tz: 'America/New_York', bookings: after })).not.toContain('booking-r1@');
  });

  it('follows every transaction page (no 20-page cap)', async () => {
    const pages = Array.from({ length: 25 }, (_, p) => [[`b${p + 1}`, 'accepted', ...slot('10')]]);
    const out = await fetchHoldingBookings(txSdk(pages), 'L', S, E);
    expect(out).toHaveLength(25);
    expect(out[24].id).toBe('b25');
  });

  it('skips bookings outside the window', async () => {
    const sdk = txSdk([[['old', 'accepted', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z']]]);
    expect(await fetchHoldingBookings(sdk, 'L', S, E)).toEqual([]);
  });
});
