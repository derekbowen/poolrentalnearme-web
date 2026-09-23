const { planImport } = require('./icalImportPlan');

const at = h => new Date(Date.UTC(2026, 9, 10, h)).toISOString();
const NOW = new Date(Date.UTC(2026, 9, 1));
const ok = events => ({ ok: true, events });
// Swimply feeds always carry history; a past event keeps a feed "non-empty".
const PAST = { uid: 'sw-past', start: '2026-08-01T14:00:00.000Z', end: '2026-08-01T16:00:00.000Z' };

// Apply a plan the way the sync would: create exceptions with new ids and
// record provenance; delete removed ones; drop forgotten records.
const apply = (state, plan) => {
  let n = state.nextId || 1;
  const existing = state.existing.filter(x => !plan.remove.includes(x.id));
  const imported = { ...state.imported };
  for (const id of [...plan.remove, ...plan.forget]) delete imported[id];
  for (const c of plan.create) {
    const id = `imp-${n++}`;
    existing.push({ id, start: c.start, end: c.end });
    imported[id] = { uid: c.uid };
  }
  return { ...state, existing, imported, nextId: n };
};
const run = (state, feed) => {
  const plan = planImport({ feed, existing: state.existing, bookings: state.bookings || [], imported: state.imported, now: NOW });
  return { plan, state: apply(state, plan) };
};
const empty = { existing: [], imported: {}, bookings: [] };

describe('Swimply -> PRNM import plan', () => {
  it('new event: blocked, with its UID recorded', () => {
    const { plan, state } = run(empty, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }]));
    expect(plan.create).toEqual([{ uid: 'sw-1', start: at(14), end: at(17) }]);
    expect(Object.values(state.imported)).toEqual([{ uid: 'sw-1' }]);
  });

  it('unchanged event: nothing to do', () => {
    const feed = ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }]);
    const first = run(empty, feed);
    const second = run(first.state, feed);
    expect(second.plan).toEqual({ create: [], remove: [], forget: [] });
  });

  it('changed start/end: the old import is removed and the new time blocked', () => {
    const first = run(empty, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }]));
    const moved = run(first.state, ok([PAST, { uid: 'sw-1', start: at(18), end: at(20) }]));
    expect(moved.plan.remove).toEqual(['imp-1']);
    expect(moved.plan.create).toEqual([{ uid: 'sw-1', start: at(18), end: at(20) }]);
  });

  it('changed end (extended): the old import stays, only the extension is added', () => {
    const first = run(empty, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }]));
    const longer = run(first.state, ok([PAST, { uid: 'sw-1', start: at(14), end: at(19) }]));
    expect(longer.plan.remove).toEqual([]);
    expect(longer.plan.create).toEqual([{ uid: 'sw-1', start: at(17), end: at(19) }]);
  });

  it('cancellation: removes exactly the block(s) created from that UID', () => {
    let s = run(empty, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }, { uid: 'sw-2', start: at(18), end: at(19) }])).state;
    const r = run(s, ok([PAST, { uid: 'sw-2', start: at(18), end: at(19) }]));
    expect(r.plan.remove).toEqual(['imp-1']);
    expect(r.plan.create).toEqual([]);
  });

  it('temporarily EMPTY feed deletes nothing', () => {
    const s = run(empty, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }])).state;
    expect(run(s, ok([])).plan).toEqual({ create: [], remove: [], forget: [] });
  });

  it('BROKEN feed (fetch/parse failure) deletes nothing', () => {
    const s = run(empty, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }])).state;
    expect(run(s, { ok: false, events: [] }).plan).toEqual({ create: [], remove: [], forget: [] });
    expect(run(s, undefined).plan).toEqual({ create: [], remove: [], forget: [] });
  });

  it('partial overlap: only the uncovered interval is blocked', () => {
    const s = { ...empty, existing: [{ id: 'host-block', start: at(13), end: at(15) }] };
    expect(run(s, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }])).plan.create).toEqual([
      { uid: 'sw-1', start: at(15), end: at(17) },
    ]);
  });

  it('full overlap: nothing created', () => {
    const s = { ...empty, existing: [{ id: 'host-block', start: at(13), end: at(18) }] };
    expect(run(s, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }])).plan.create).toEqual([]);
  });

  it('two imported events overlapping each other: no double block, both cancellable independently', () => {
    const feed = ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }, { uid: 'sw-2', start: at(16), end: at(19) }]);
    const first = run(empty, feed);
    expect(first.plan.create).toEqual([
      { uid: 'sw-1', start: at(14), end: at(17) },
      { uid: 'sw-2', start: at(17), end: at(19) },
    ]);
    // sw-1 cancelled: its block goes; sw-2's 16-17 is now uncovered and gets blocked.
    const after = run(first.state, ok([PAST, { uid: 'sw-2', start: at(16), end: at(19) }]));
    expect(after.plan.remove).toEqual(['imp-1']);
    expect(after.plan.create).toEqual([{ uid: 'sw-2', start: at(16), end: at(17) }]);
  });

  it('manual PRNM block overlapping an imported event is never removed, even when the event is cancelled', () => {
    const s0 = { ...empty, existing: [{ id: 'host-block', start: at(15), end: at(16) }] };
    const first = run(s0, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }]));
    const cancelled = run(first.state, ok([PAST]));
    expect(cancelled.plan.remove.sort()).toEqual(['imp-1', 'imp-2']);
    expect(cancelled.state.existing.map(x => x.id)).toEqual(['host-block']);
  });

  it('never deletes another provider\'s block or a Sharetribe booking', () => {
    const s = {
      existing: [{ id: 'airbnb-block', start: at(10), end: at(12) }],
      bookings: [{ start: at(13), end: at(15) }],
      imported: {},
    };
    const r = run(s, ok([PAST]));
    expect(r.plan.remove).toEqual([]);
    // and a Swimply event over a booking only blocks what the booking doesn't hold
    expect(run(s, ok([PAST, { uid: 'sw-1', start: at(14), end: at(16) }])).plan.create).toEqual([
      { uid: 'sw-1', start: at(15), end: at(16) },
    ]);
  });

  it('duplicate UID: treated as one source, union of its intervals, no duplicate blocks', () => {
    const feed = ok([
      PAST,
      { uid: 'sw-1', start: at(14), end: at(16) },
      { uid: 'sw-1', start: at(14), end: at(16) },
      { uid: 'sw-1', start: at(15), end: at(17) },
    ]);
    const first = run(empty, feed);
    expect(first.plan.create).toEqual([{ uid: 'sw-1', start: at(14), end: at(17) }]);
    expect(run(first.state, feed).plan).toEqual({ create: [], remove: [], forget: [] });
  });

  it('sync run twice on the same feed: second run plans nothing', () => {
    const s0 = { ...empty, existing: [{ id: 'host-block', start: at(15), end: at(16) }] };
    const feed = ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }, { uid: 'sw-2', start: at(20), end: at(22) }]);
    const first = run(s0, feed);
    expect(first.plan.create.length).toBe(3);
    expect(run(first.state, feed).plan).toEqual({ create: [], remove: [], forget: [] });
  });

  it('an import the host deleted by hand is forgotten; the still-booked time is re-blocked', () => {
    const first = run(empty, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }]));
    const hostDeleted = { ...first.state, existing: [] };
    const r = run(hostDeleted, ok([PAST, { uid: 'sw-1', start: at(14), end: at(17) }]));
    expect(r.plan.forget).toEqual(['imp-1']);
    expect(r.plan.remove).toEqual([]);
    expect(r.plan.create).toEqual([{ uid: 'sw-1', start: at(14), end: at(17) }]);
  });

  it('never removes past imports', () => {
    const s = {
      existing: [{ id: 'imp-old', start: '2026-09-01T14:00:00.000Z', end: '2026-09-01T17:00:00.000Z' }],
      imported: { 'imp-old': { uid: 'sw-old' } },
      bookings: [],
    };
    expect(run(s, ok([PAST])).plan.remove).toEqual([]);
  });
});
