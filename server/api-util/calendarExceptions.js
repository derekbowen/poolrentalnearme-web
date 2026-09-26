const moment = require('moment-timezone');

/**
 * PRNM custom-calendar → Sharetribe availability-exception reconciliation.
 *
 * Ownership: Sharetribe exceptions carry no metadata, so the ids PRNM created are
 * tracked in listing privateData[TRACK_KEY] (server-written only; the edit panel
 * writes publicData.availability wholesale and used to clobber the old tracking
 * key inside it). The legacy publicData.availability.calendarExceptionIds is read
 * as well — it only ever held ids this server created.
 *
 * Rules:
 *   - a tracked exception that is no longer desired → delete
 *   - an untracked exception → never touched, never deleted (it may be the host's
 *     own block, an iCal/Swimply import, or a PRNM block from before tracking
 *     survived — PRNM never deletes what it cannot prove it created)
 *   - desired time already blocked by an untracked exception → nothing to create
 *   - desired time not blocked by anything → create and track
 */

const TRACK_KEY = 'prnmCalendarExceptionIds';
const DAY_MS = 24 * 60 * 60 * 1000;

const idOf = (x) => (x && x.id && (x.id.uuid || x.id)) || null;
const ms = (d) => (d instanceof Date ? d.getTime() : Date.parse(d));

// Blocked ranges one day's override implies, in the listing's timezone.
const rangesForOverride = (date, o, tz) => {
  const out = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !o) return out;
  const dayStart = moment.tz(`${date} 00:00`, 'YYYY-MM-DD HH:mm', tz);
  const dayEnd = dayStart.clone().add(1, 'day');
  const at = (h) => (h >= 24 ? dayEnd : dayStart.clone().hour(h));
  if (o.closed) {
    out.push([dayStart.valueOf(), dayEnd.valueOf()]);
    return out;
  }
  if (
    Number.isInteger(o.open) &&
    Number.isInteger(o.close) &&
    o.close > o.open &&
    (o.open > 0 || o.close < 24)
  ) {
    if (o.open > 0) out.push([dayStart.valueOf(), at(o.open).valueOf()]);
    if (o.close < 24) out.push([at(o.close).valueOf(), dayEnd.valueOf()]);
  }
  if (Array.isArray(o.blocks)) {
    for (const b of o.blocks) {
      if (!Array.isArray(b) || b.length !== 2) continue;
      const [s, e] = b;
      if (!Number.isInteger(s) || !Number.isInteger(e) || e <= s || s < 0 || e > 24) continue;
      out.push([at(s).valueOf(), at(e).valueOf()]);
    }
  }
  return out;
};

// Every desired range across all overrides that has not already ended.
const desiredRanges = (overrides, tz, nowMs) => {
  const out = [];
  Object.keys(overrides || {})
    .sort()
    .forEach((date) => {
      rangesForOverride(date, overrides[date], tz).forEach(([s, e]) => {
        if (e > nowMs) out.push({ date, start: s, end: e });
      });
    });
  return out;
};

const trackedIds = (privateData, availability) => {
  const ids = new Set();
  const add = (map) =>
    Object.keys(map || {}).forEach((d) => (map[d] || []).forEach((id) => id && ids.add(id)));
  add((privateData || {})[TRACK_KEY]);
  add((availability || {}).calendarExceptionIds);
  return ids;
};

/**
 * Pure planning step.
 * actual: [{ id, start(ms), end(ms), seats }]; desired: from desiredRanges().
 *
 * Untracked blocks are never touched, and Sharetribe forbids overlapping
 * exceptions, so each desired range is first split around them: what they
 * already block needs nothing, the gaps are what PRNM must block. (A day the
 * host closes that already holds a 1-hour manual block gets blocked around it
 * instead of failing with a 409 and staying bookable.)
 * A tracked exception satisfies a piece when it covers it exactly — or, for a
 * piece already in progress, when it ends at the same instant and starts no
 * earlier than the piece (Sharetribe rejects past starts, so creation clamps).
 */
const planReconcile = ({ actual, desired, tracked, nowMs }) => {
  const blocked = actual.filter((a) => a.seats === 0);
  const foreign = blocked.filter((a) => !tracked.has(a.id)).sort((x, y) => x.start - y.start);
  const satisfies = (a, d) =>
    a.end === d.end &&
    (a.start === d.start || (d.start < nowMs && a.start >= d.start && a.start <= nowMs + 5 * 60e3));

  const pieces = [];
  let alreadyBlocked = 0;
  desired.forEach((d) => {
    let cur = d.start;
    let touched = false;
    foreign.forEach((f) => {
      if (cur >= d.end || f.end <= cur || f.start >= d.end) return;
      touched = true;
      if (f.start > cur) pieces.push({ date: d.date, start: cur, end: f.start });
      cur = Math.max(cur, f.end);
    });
    if (cur < d.end) pieces.push({ date: d.date, start: cur, end: d.end });
    if (touched) alreadyBlocked += 1;
  });

  const keepOwned = new Set();
  const keep = [];
  const toCreate = [];
  pieces.forEach((d) => {
    const own = blocked.find((a) => tracked.has(a.id) && !keepOwned.has(a.id) && satisfies(a, d));
    if (own) {
      keepOwned.add(own.id);
      keep.push({ id: own.id, date: d.date });
    } else {
      toCreate.push(d);
    }
  });
  const toDelete = blocked.filter((a) => tracked.has(a.id) && !keepOwned.has(a.id));
  return { keep, toDelete, toCreate, alreadyBlocked };
};

const queryAll = async (integrationSdk, listingId, start, end) => {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await integrationSdk.availabilityExceptions.query(
      { listingId, start, end, perPage: 100, page },
      { allowRawResponse: true }
    );
    const raw = ((r || {})._raw || {}).data || {};
    const chunk = raw.data || [];
    chunk.forEach((x) => {
      const a = x.attributes || {};
      out.push({ id: idOf(x), start: ms(a.start), end: ms(a.end), seats: a.seats });
    });
    const tp = (raw.meta || {}).totalPages || 1;
    if (page >= tp || chunk.length === 0) break;
  }
  return out;
};

// One reconcile at a time per listing (the container runs a single node process).
const chains = new Map();
const serialize = (key, fn) => {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.catch(() => null).then(fn);
  const tail = run.catch(() => null);
  chains.set(key, tail);
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
};

/**
 * Reads the listing fresh, reconciles, persists tracking, returns final state.
 * Always re-reads inside the lock, so a queued save applies the newest overrides.
 */
const reconcileListing = (integrationSdk, listingId, { now = () => Date.now() } = {}) =>
  serialize(listingId, async () => {
    // The integration SDK is wrapped (wrapInstanceWithResponseTransformer): the
    // raw Sharetribe body is only on `_raw`, and only with allowRawResponse.
    const shown = await integrationSdk.listings.show({ id: listingId }, { allowRawResponse: true });
    const attrs = ((((shown || {})._raw || {}).data || {}).data || {}).attributes || {};
    const availability = (attrs.publicData || {}).availability || {};
    const tz = (attrs.availabilityPlan && attrs.availabilityPlan.timezone) || 'Etc/UTC';
    const nowMs = now();

    const winStart = nowMs - DAY_MS;
    const winEnd = winStart + 365 * DAY_MS;
    const desired = desiredRanges(availability.dateOverrides, tz, nowMs).filter(
      (d) => d.start < winEnd
    );
    const tracked = trackedIds(attrs.privateData, availability);
    const actual = await queryAll(integrationSdk, listingId, new Date(winStart), new Date(winEnd));

    const plan = planReconcile({ actual, desired, tracked, nowMs });

    const deleted = [];
    const failed = [];
    for (const a of plan.toDelete) {
      try {
        await integrationSdk.availabilityExceptions.delete({ id: a.id });
        deleted.push(a.id);
      } catch (e) {
        if (e && e.status === 404) deleted.push(a.id);
        else failed.push({ op: 'delete', id: a.id, status: e && e.status });
      }
    }

    const nextTrack = {};
    const track = (date, id) => (nextTrack[date] = (nextTrack[date] || []).concat(id));
    // Kept ids stay tracked under the date of the range they satisfy.
    plan.keep.forEach((k) => track(k.date, k.id));
    // Tracked ids whose delete failed stay tracked so the next save retries them.
    failed.forEach((f) => track('pending-delete', f.id));

    const created = [];
    for (const d of plan.toCreate) {
      const start = Math.max(d.start, nowMs + 60e3);
      if (start >= d.end) continue;
      try {
        const r = await integrationSdk.availabilityExceptions.create(
          { listingId, seats: 0, start: new Date(start), end: new Date(d.end) },
          { allowRawResponse: true }
        );
        const id = idOf((((r || {})._raw || {}).data || {}).data);
        if (id) {
          created.push(id);
          track(d.date, id);
        } else {
          failed.push({ op: 'create-untracked', date: d.date });
        }
      } catch (e) {
        failed.push({ op: 'create', date: d.date, status: e && e.status });
      }
    }

    // privateData merges by top-level key, so this touches nothing else.
    await integrationSdk.listings.update({
      id: listingId,
      privateData: { [TRACK_KEY]: nextTrack },
    });

    const finalActual = await queryAll(
      integrationSdk,
      listingId,
      new Date(winStart),
      new Date(winEnd)
    );
    const owned = new Set(Object.values(nextTrack).reduce((a, ids) => a.concat(ids), []));
    return {
      ok: failed.length === 0,
      timezone: tz,
      desired: desired.length,
      created: created.length,
      deleted: deleted.length,
      kept: plan.keep.length,
      alreadyBlocked: plan.alreadyBlocked,
      failed,
      exceptions: finalActual
        .filter((a) => a.seats === 0)
        .map((a) => ({
          id: a.id,
          start: new Date(a.start).toISOString(),
          end: new Date(a.end).toISOString(),
          source: owned.has(a.id) ? 'prnm' : 'other',
        })),
    };
  });

module.exports = {
  TRACK_KEY,
  rangesForOverride,
  desiredRanges,
  trackedIds,
  planReconcile,
  reconcileListing,
};
