// PROPOSED (not wired in yet): what a Swimply -> PRNM sync should create and remove.
// See docs/calendar/CALENDAR_SYNC_FOLLOWUPS.md.
//
// Fixes the two known gaps in sync-ical.js / swimply-resync.js:
//  1. Partial overlap. Today an event that overlaps ANY existing exception is
//     treated as covered, so a Swimply booking 2-5 PM next to a PRNM block
//     1-3 PM leaves 3-5 PM open on PRNM. Here only the uncovered remainder is
//     created.
//  2. Cancellation. Today the sync is create-only, so a cancelled Swimply
//     booking stays blocked on PRNM forever. Here an exception is removed only
//     if THIS sync created it (recorded by Swimply UID) and its UID is gone
//     from the feed. Host blocks and bookings are never touched.
//
// events:   [{ uid, start, end }]  from the Swimply feed (ISO or Date)
// existing: [{ id, start, end }]   seats:0 exceptions on the listing
// imported: { [exceptionId]: uid } exceptions previously created by the sync
// now:      Date
// -> { create: [{ uid, start, end }], remove: [exceptionId] }
const t = v => new Date(v).getTime();

// Parts of [s, e) not covered by any interval in `covers` (sorted, merged).
const uncoveredParts = (s, e, covers) => {
  const out = [];
  let cursor = s;
  for (const c of covers) {
    if (c.e <= cursor) continue;
    if (c.s >= e) break;
    if (c.s > cursor) out.push({ s: cursor, e: Math.min(c.s, e) });
    cursor = Math.max(cursor, c.e);
    if (cursor >= e) break;
  }
  if (cursor < e) out.push({ s: cursor, e });
  return out;
};

const merge = intervals => {
  const sorted = intervals.slice().sort((a, b) => a.s - b.s);
  const out = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.s <= last.e) last.e = Math.max(last.e, i.e);
    else out.push({ ...i });
  }
  return out;
};

const planImport = ({ events, existing, imported = {}, now = new Date() }) => {
  const nowMs = t(now);
  const liveUids = new Set(events.map(ev => ev.uid));

  // 2. Cancellations: only our own imports whose Swimply event is gone.
  const remove = existing
    .filter(x => imported[x.id] && !liveUids.has(imported[x.id]) && t(x.end) > nowMs)
    .map(x => x.id);
  const removed = new Set(remove);

  // 1. Partial overlap: cover what is not already covered.
  let covers = merge(
    existing.filter(x => !removed.has(x.id)).map(x => ({ s: t(x.start), e: t(x.end) }))
  );
  const create = [];
  for (const ev of events.slice().sort((a, b) => t(a.start) - t(b.start))) {
    const s = Math.max(t(ev.start), nowMs);
    const e = t(ev.end);
    if (!(e > s)) continue;
    for (const part of uncoveredParts(s, e, covers)) {
      create.push({ uid: ev.uid, start: new Date(part.s).toISOString(), end: new Date(part.e).toISOString() });
    }
    covers = merge([...covers, { s, e }]);
  }
  return { create, remove };
};

module.exports = { planImport };
