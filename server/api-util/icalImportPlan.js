// PROPOSED (not wired in, not deployed): what one Swimply -> PRNM sync run
// should create and delete. See docs/calendar/CALENDAR_SYNC_FOLLOWUPS.md.
//
// Safety rules, each covered by a test in icalImportPlan.test.js:
//  - Only exceptions this sync created (recorded in `imported`, keyed by the
//    Sharetribe exception id, with the Swimply UID it came from) can ever be
//    deleted. Host blocks, bookings and other providers' blocks are never
//    candidates, whatever the feed says.
//  - An import is deleted only when its UID is gone from a feed that was read
//    successfully and is non-empty, or when that UID's event moved and the
//    import no longer lies inside it. A failed or empty feed deletes nothing.
//  - Partial overlaps block only the uncovered interval.
//  - Re-running the same feed plans nothing (idempotent).
//
// Input
//   feed:     { ok: boolean, events: [{ uid, start, end }] }
//   existing: [{ id, start, end }]         seats:0 exceptions on the listing
//   bookings: [{ start, end }]             bookings holding the listing (never deleted)
//   imported: { [exceptionId]: { uid } }   provenance written by previous runs
//   now:      Date
// Output
//   { create: [{ uid, start, end }], remove: [exceptionId], forget: [exceptionId] }
//   `forget` = provenance for exceptions that no longer exist (someone deleted
//   them); drop the record, never recreate from provenance alone.
const t = v => new Date(v).getTime();
const iso = ms => new Date(ms).toISOString();

const merge = intervals => {
  const out = [];
  for (const i of intervals.slice().sort((a, b) => a.s - b.s)) {
    const last = out[out.length - 1];
    if (last && i.s <= last.e) last.e = Math.max(last.e, i.e);
    else out.push({ s: i.s, e: i.e });
  }
  return out;
};

// Parts of [s, e) not covered by `covers` (sorted and merged).
const uncovered = (s, e, covers) => {
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

const inside = (x, intervals) => intervals.some(i => x.s >= i.s && x.e <= i.e);

const planImport = ({ feed, existing = [], bookings = [], imported = {}, now = new Date() }) => {
  const nowMs = t(now);
  const plan = { create: [], remove: [], forget: [] };
  const existingById = new Map(existing.map(x => [x.id, { s: t(x.start), e: t(x.end) }]));

  // Provenance for exceptions that no longer exist is dropped, never acted on.
  for (const id of Object.keys(imported)) if (!existingById.has(id)) plan.forget.push(id);

  // A feed we could not read, or one with no events at all, is not evidence
  // that everything was cancelled. Swimply feeds carry their full history
  // (the Ledyard feed has 534 events), so an empty feed means "broken", not
  // "nothing booked". Do nothing.
  if (!feed || !feed.ok || !Array.isArray(feed.events) || feed.events.length === 0) return plan;

  // Desired coverage per UID; a duplicated UID contributes the union of its events.
  const byUid = new Map();
  for (const ev of feed.events) {
    if (!ev || !ev.uid) continue;
    const s = t(ev.start);
    const e = t(ev.end);
    if (!(e > s)) continue;
    if (!byUid.has(ev.uid)) byUid.set(ev.uid, []);
    byUid.get(ev.uid).push({ s, e });
  }
  for (const [uid, ivs] of byUid) byUid.set(uid, merge(ivs));

  // Deletions: only our own, future imports whose event vanished or moved away.
  for (const [id, rec] of Object.entries(imported)) {
    const x = existingById.get(id);
    if (!x || x.e <= nowMs) continue;
    const wanted = byUid.get(rec && rec.uid);
    if (!wanted || !inside(x, wanted)) plan.remove.push(id);
  }

  // Creations: the uncovered parts of every future event.
  const removed = new Set(plan.remove);
  let covers = merge([
    ...existing.filter(x => !removed.has(x.id)).map(x => ({ s: t(x.start), e: t(x.end) })),
    ...bookings.map(b => ({ s: t(b.start), e: t(b.end) })),
  ]);
  const uids = [...byUid.keys()].sort();
  for (const uid of uids) {
    for (const iv of byUid.get(uid)) {
      const s = Math.max(iv.s, nowMs);
      if (!(iv.e > s)) continue;
      for (const part of uncovered(s, iv.e, covers)) {
        plan.create.push({ uid, start: iso(part.s), end: iso(part.e) });
      }
      covers = merge([...covers, { s, e: iv.e }]);
    }
  }
  return plan;
};

module.exports = { planImport };
