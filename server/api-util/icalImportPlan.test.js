const { planImport } = require('./icalImportPlan');

const at = h => new Date(Date.UTC(2026, 9, 10, h)).toISOString();
const NOW = new Date(Date.UTC(2026, 9, 1));

describe('Swimply -> PRNM import plan', () => {
  it('GAP 1 (partial overlap): only the uncovered remainder is blocked', () => {
    // PRNM already blocks 13-15; Swimply booking 14-17. Today: nothing is
    // created (treated as covered) and 15-17 stays bookable on PRNM.
    const plan = planImport({
      events: [{ uid: 'sw-1', start: at(14), end: at(17) }],
      existing: [{ id: 'host-block', start: at(13), end: at(15) }],
      now: NOW,
    });
    expect(plan.create).toEqual([{ uid: 'sw-1', start: at(15), end: at(17) }]);
    expect(plan.remove).toEqual([]);
  });

  it('blocks the gaps between two existing blocks', () => {
    const plan = planImport({
      events: [{ uid: 'sw-1', start: at(10), end: at(20) }],
      existing: [
        { id: 'a', start: at(11), end: at(12) },
        { id: 'b', start: at(15), end: at(16) },
      ],
      now: NOW,
    });
    expect(plan.create.map(c => [c.start, c.end])).toEqual([
      [at(10), at(11)],
      [at(12), at(15)],
      [at(16), at(20)],
    ]);
  });

  it('a fully covered event creates nothing', () => {
    const plan = planImport({
      events: [{ uid: 'sw-1', start: at(14), end: at(15) }],
      existing: [{ id: 'x', start: at(13), end: at(16) }],
      now: NOW,
    });
    expect(plan.create).toEqual([]);
  });

  it('GAP 2 (cancellation): an import whose Swimply event is gone is removed', () => {
    const plan = planImport({
      events: [],
      existing: [{ id: 'imp-1', start: at(14), end: at(17) }],
      imported: { 'imp-1': 'sw-1' },
      now: NOW,
    });
    expect(plan.remove).toEqual(['imp-1']);
  });

  it('never removes a host block or anything the sync did not create', () => {
    const plan = planImport({
      events: [],
      existing: [{ id: 'host-block', start: at(14), end: at(17) }],
      imported: {},
      now: NOW,
    });
    expect(plan.remove).toEqual([]);
  });

  it('keeps an import whose Swimply event still exists', () => {
    const plan = planImport({
      events: [{ uid: 'sw-1', start: at(14), end: at(17) }],
      existing: [{ id: 'imp-1', start: at(14), end: at(17) }],
      imported: { 'imp-1': 'sw-1' },
      now: NOW,
    });
    expect(plan).toEqual({ create: [], remove: [] });
  });

  it('never removes past imports', () => {
    const plan = planImport({
      events: [],
      existing: [{ id: 'imp-old', start: '2026-09-01T14:00:00.000Z', end: '2026-09-01T17:00:00.000Z' }],
      imported: { 'imp-old': 'sw-old' },
      now: NOW,
    });
    expect(plan.remove).toEqual([]);
  });

  it('a moved Swimply booking: old import removed, new time blocked', () => {
    const plan = planImport({
      events: [{ uid: 'sw-2', start: at(18), end: at(20) }],
      existing: [{ id: 'imp-1', start: at(14), end: at(17) }],
      imported: { 'imp-1': 'sw-1' },
      now: NOW,
    });
    expect(plan.remove).toEqual(['imp-1']);
    expect(plan.create).toEqual([{ uid: 'sw-2', start: at(18), end: at(20) }]);
  });
});
