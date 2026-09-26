const {
  TRACK_KEY,
  desiredRanges,
  planReconcile,
  reconcileListing,
} = require('./calendarExceptions');

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-09-25T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

// In-memory Sharetribe: overlapping exceptions 409, like the real API.
// `panelSave` mimics the edit panel writing publicData.availability wholesale.
const fakeSharetribe = ({ overrides = {}, manual = [], legacyIds } = {}) => {
  let seq = 0;
  const exceptions = new Map();
  manual.forEach(([s, e]) =>
    exceptions.set(`manual-${++seq}`, { start: Date.parse(s), end: Date.parse(e) })
  );
  const listing = {
    publicData: {
      availability: {
        dateOverrides: overrides,
        ...(legacyIds ? { calendarExceptionIds: legacyIds } : {}),
      },
    },
    privateData: {},
  };
  const tick = () => new Promise((r) => setTimeout(r, 1));
  // Mirrors wrapInstanceWithResponseTransformer: callers get the denormalised
  // entity; the raw body only on `_raw`, and only with { allowRawResponse: true }.
  const wrapped = (raw, opts) => {
    const out = Array.isArray(raw.data.data) ? [...raw.data.data] : { ...raw.data.data };
    if (opts && opts.allowRawResponse) out._raw = raw;
    return out;
  };
  const sdk = {
    listings: {
      show: async (params, opts) => {
        await tick();
        return wrapped(
          {
            data: {
              data: {
                attributes: {
                  availabilityPlan: { timezone: TZ },
                  publicData: JSON.parse(JSON.stringify(listing.publicData)),
                  privateData: JSON.parse(JSON.stringify(listing.privateData)),
                },
              },
            },
          },
          opts
        );
      },
      update: async ({ publicData, privateData }) => {
        await tick();
        Object.assign(listing.publicData, publicData || {});
        Object.assign(listing.privateData, privateData || {});
      },
    },
    availabilityExceptions: {
      query: async ({ start, end }, opts) => {
        await tick();
        const data = [...exceptions.entries()]
          .filter(([, x]) => x.start < end.getTime() && x.end > start.getTime())
          .map(([id, x]) => ({
            id: { uuid: id },
            attributes: { start: iso(x.start), end: iso(x.end), seats: 0 },
          }));
        return wrapped({ data: { data, meta: { totalPages: 1 } } }, opts);
      },
      create: async ({ start, end }, opts) => {
        await tick();
        const s = start.getTime();
        const e = end.getTime();
        for (const x of exceptions.values()) {
          if (x.start < e && x.end > s) {
            const err = new Error('conflict');
            err.status = 409;
            throw err;
          }
        }
        const id = `prnm-${++seq}`;
        exceptions.set(id, { start: s, end: e });
        return wrapped({ data: { data: { id: { uuid: id } } } }, opts);
      },
      delete: async ({ id }) => {
        await tick();
        if (!exceptions.delete(id)) {
          const err = new Error('nf');
          err.status = 404;
          throw err;
        }
      },
    },
  };
  const panelSave = (dateOverrides) => {
    listing.publicData.availability = { ...listing.publicData.availability, dateOverrides };
  };
  const list = () =>
    [...exceptions.entries()]
      .map(([id, x]) => ({ id, start: iso(x.start), end: iso(x.end) }))
      .sort((a, b) => (a.start < b.start ? -1 : 1));
  return { sdk, listing, exceptions, panelSave, list };
};

const run = (f) => reconcileListing(f.sdk, 'L1', { now: () => NOW });
const tracked = (f) =>
  Object.values(f.listing.privateData[TRACK_KEY] || {}).reduce((a, ids) => a.concat(ids), []);

// Sunday Sep 27 open 9–15 Chicago (CDT, UTC-5).
const SUNDAY_9_3 = { '2026-09-27': { open: 9, close: 15 } };
const SUN_BEFORE = ['2026-09-27T05:00:00.000Z', '2026-09-27T14:00:00.000Z'];
const SUN_AFTER = ['2026-09-27T20:00:00.000Z', '2026-09-28T05:00:00.000Z'];

describe('calendar exception reconciliation', () => {
  it('derives the edge blocks for custom hours in the listing timezone', () => {
    const d = desiredRanges(SUNDAY_9_3, TZ, NOW).map((r) => [iso(r.start), iso(r.end)]);
    expect(d).toEqual([SUN_BEFORE, SUN_AFTER]);
  });

  it('1. saving custom hours creates blocks that stay tracked and reconcilable', async () => {
    const f = fakeSharetribe({ overrides: SUNDAY_9_3 });
    const r = await run(f);
    expect(r.created).toBe(2);
    expect(f.list().map((x) => [x.start, x.end])).toEqual([SUN_BEFORE, SUN_AFTER]);
    expect(tracked(f).sort()).toEqual(
      f
        .list()
        .map((x) => x.id)
        .sort()
    );
    expect(r.exceptions.every((x) => x.source === 'prnm')).toBe(true);
    // Idempotent: a second save changes nothing.
    const again = await run(f);
    expect(again).toMatchObject({ created: 0, deleted: 0, kept: 2 });
    expect(f.list()).toHaveLength(2);
  });

  it('tracking survives the panel rewriting publicData.availability', async () => {
    const f = fakeSharetribe({ overrides: SUNDAY_9_3 });
    await run(f);
    f.panelSave({ '2026-09-27': { closed: true } }); // stale copy, no tracking inside
    await run(f);
    expect(f.list().map((x) => [x.start, x.end])).toEqual([[SUN_BEFORE[0], SUN_AFTER[1]]]);
  });

  it('2. rapid consecutive saves leave no orphan or duplicate blocks', async () => {
    const f = fakeSharetribe();
    const saves = [
      { '2026-09-27': { open: 9, close: 15 } },
      { '2026-09-27': { open: 10, close: 16 } },
      { '2026-09-27': { open: 9, close: 15 }, '2026-09-29': { closed: true } },
      { '2026-09-27': { open: 8, close: 14 } },
    ];
    // Each panel save lands, then its apply fires without waiting for the last.
    const inflight = saves.map((ov) => {
      f.panelSave(ov);
      return run(f);
    });
    await Promise.all(inflight);
    const final = desiredRanges(saves[saves.length - 1], TZ, NOW).map((d) => [
      iso(d.start),
      iso(d.end),
    ]);
    expect(f.list().map((x) => [x.start, x.end])).toEqual(final);
    expect(tracked(f).sort()).toEqual(
      f
        .list()
        .map((x) => x.id)
        .sort()
    );
  });

  it('3. changing custom hours removes obsolete PRNM blocks and creates the new ones', async () => {
    const f = fakeSharetribe({ overrides: SUNDAY_9_3 });
    await run(f);
    const oldIds = f.list().map((x) => x.id);
    f.panelSave({ '2026-09-27': { open: 11, close: 17 } });
    const r = await run(f);
    expect(r).toMatchObject({ deleted: 2, created: 2 });
    expect(f.list().map((x) => [x.start, x.end])).toEqual([
      ['2026-09-27T05:00:00.000Z', '2026-09-27T16:00:00.000Z'],
      ['2026-09-27T22:00:00.000Z', '2026-09-28T05:00:00.000Z'],
    ]);
    expect(f.list().some((x) => oldIds.includes(x.id))).toBe(false);
    // Reopening the day removes everything PRNM made.
    f.panelSave({});
    await run(f);
    expect(f.list()).toEqual([]);
  });

  it('4. manual / non-PRNM blocks are preserved', async () => {
    const manual = [
      ['2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z'], // host's own block
      ['2026-09-29T05:00:00.000Z', '2026-09-30T05:00:00.000Z'], // untracked full day
    ];
    const f = fakeSharetribe({ overrides: SUNDAY_9_3, manual });
    await run(f);
    f.panelSave({ '2026-10-01': { closed: true } });
    const r = await run(f);
    const ids = f.list().map((x) => x.id);
    expect(ids).toContain('manual-1');
    expect(ids).toContain('manual-2');
    // Closing Oct 1 (Chicago) blocks the whole day AROUND the host's own block.
    expect(r.ok).toBe(true);
    expect(
      f
        .list()
        .filter((x) => x.start.startsWith('2026-10-01'))
        .map((x) => [x.id.split('-')[0], x.start, x.end])
    ).toEqual([
      ['prnm', '2026-10-01T05:00:00.000Z', '2026-10-01T10:00:00.000Z'],
      ['manual', '2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z'],
      ['prnm', '2026-10-01T11:00:00.000Z', '2026-10-02T05:00:00.000Z'],
    ]);
    expect(r.exceptions.filter((x) => x.source === 'other')).toHaveLength(2);
    // Idempotent around the manual block too.
    expect(await run(f)).toMatchObject({ created: 0, deleted: 0, kept: 2 });
    // Reopening Oct 1 removes only PRNM's pieces.
    f.panelSave({});
    await run(f);
    expect(
      f
        .list()
        .map((x) => x.id)
        .sort()
    ).toEqual(['manual-1', 'manual-2']);
  });

  it('untracked blocks that already match the schedule are not duplicated or deleted', async () => {
    // The live Sunday case: two correct blocks exist but are untracked.
    const f = fakeSharetribe({ overrides: SUNDAY_9_3, manual: [SUN_BEFORE, SUN_AFTER] });
    const r = await run(f);
    expect(r).toMatchObject({ created: 0, deleted: 0, alreadyBlocked: 2 });
    expect(
      f
        .list()
        .map((x) => x.id)
        .sort()
    ).toEqual(['manual-1', 'manual-2']);
  });

  it('legacy publicData tracking ids are still honoured for cleanup', async () => {
    const f = fakeSharetribe({
      manual: [SUN_BEFORE, SUN_AFTER],
      legacyIds: { '2026-09-27': ['manual-1', 'manual-2'] },
    });
    const r = await run(f);
    expect(r.deleted).toBe(2);
    expect(f.list()).toEqual([]);
  });

  it('planReconcile never deletes an untracked exception', () => {
    const plan = planReconcile({
      actual: [{ id: 'x', start: NOW + 1e6, end: NOW + 2e6, seats: 0 }],
      desired: [],
      tracked: new Set(),
      nowMs: NOW,
    });
    expect(plan.toDelete).toEqual([]);
  });
});
