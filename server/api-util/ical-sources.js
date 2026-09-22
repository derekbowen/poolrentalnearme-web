// Sharetribe reads behind the per-listing iCal feed. Kept free of SDK wiring
// (the sdk is passed in) so the paging logic is unit-testable.
//
// Everything that holds inventory in Sharetribe must reach the feed, or an
// external calendar (Swimply, Google, Apple) will offer a slot we cannot honor:
//   - bookings in state `pending` (request awaiting host) or `accepted`.
//     Sharetribe's create-pending-booking reserves the time; decline, expire
//     and cancel release it (booking state -> declined/cancelled), and the
//     event drops out of the feed on the next build. No parallel state.
//   - availability exceptions with seats:0 (host blocks + Swimply imports).
// Both reads follow EVERY page. A single unpaginated exceptions query used to
// cap the feed at Sharetribe's default page size of 100.

const HOLDING_BOOKING_STATES = ['pending', 'accepted'];
const PER_PAGE = 100;
// Runaway guards only — far above any real listing. Hitting one throws, so
// the handler serves an error instead of a silently truncated calendar.
const MAX_TX_PAGES = 200;
const MAX_EXCEPTION_PAGES = 100;

const rawOf = res => (res && res._raw ? res._raw : res).data;
const uuidOf = id => (id && id.uuid) || id;

async function fetchHoldingBookings(sdk, listingId, start, end) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  do {
    if (page > MAX_TX_PAGES) {
      throw new Error(`ical: transactions exceed ${MAX_TX_PAGES} pages for ${listingId}`);
    }
    const raw = rawOf(
      await sdk.transactions.query(
        { listingId, include: ['booking'], perPage: PER_PAGE, page },
        { allowRawResponse: true }
      )
    );
    totalPages = (raw.meta && raw.meta.totalPages) || 1;
    for (const b of (raw.included || []).filter(i => i.type === 'booking')) {
      const a = b.attributes || {};
      if (!HOLDING_BOOKING_STATES.includes(a.state) || !a.start || !a.end) continue;
      if (new Date(a.end) <= start || new Date(a.start) >= end) continue;
      out.push({ id: uuidOf(b.id), start: a.start, end: a.end, state: a.state });
    }
    page++;
  } while (page <= totalPages);
  return out;
}

async function fetchBlockingExceptions(sdk, listingId, start, end) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  do {
    if (page > MAX_EXCEPTION_PAGES) {
      throw new Error(`ical: exceptions exceed ${MAX_EXCEPTION_PAGES} pages for ${listingId}`);
    }
    const raw = rawOf(
      await sdk.availabilityExceptions.query(
        { listingId, start, end, perPage: PER_PAGE, page },
        { allowRawResponse: true }
      )
    );
    totalPages = (raw.meta && raw.meta.totalPages) || 1;
    for (const e of raw.data || []) {
      const a = e.attributes || {};
      if (a.seats !== 0 || !a.start || !a.end) continue;
      out.push({ id: uuidOf(e.id), start: a.start, end: a.end });
    }
    page++;
  } while (page <= totalPages);
  return out;
}

module.exports = {
  fetchHoldingBookings,
  fetchBlockingExceptions,
  HOLDING_BOOKING_STATES,
};
