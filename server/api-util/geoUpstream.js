// Outbound geocoding: cache, throttle and in-flight de-duplication.
//
// Replaces the previous behaviour in geocodeSuggest, where nominatimFallback()
// cached whatever it got back for 24 hours - INCLUDING the empty array produced
// by a 429, a non-JSON body or a timeout. One throttled minute therefore
// poisoned those exact query strings for a full day, and because the cache is
// per-container and in-memory, the damage was invisible until a restart.
//
// Rules here:
//   - a successful lookup with results  -> cached for 24h
//   - a successful lookup with NO match -> cached briefly (10 min), so a real
//     "nowhere called that" answer is cheap to repeat but self-heals fast
//   - 429 / 5xx / network / timeout / unparseable -> NEVER cached
//   - cache entries record their state, so an error can never be mistaken for
//     a negative result
//
// Nominatim's usage policy is ~1 request/second. Requests are queued through a
// single-file limiter, and identical in-flight lookups share one upstream call,
// so twenty guests searching "Windham NH" at once produce one request, not twenty.

const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_UA = 'PoolRentalNearMe/1.0 (support@poolrentalnearme.com)';

const MIN_UPSTREAM_INTERVAL_MS = Number(process.env.NOMINATIM_MIN_INTERVAL_MS || 1100);
const UPSTREAM_TIMEOUT_MS = Number(process.env.NOMINATIM_TIMEOUT_MS || 6000);

const SUCCESS_TTL_MS = 24 * 3600 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;

const STATE_SUCCESS = 'success';
const STATE_EMPTY = 'empty';
const STATE_ERROR = 'error';

const cache = new Map(); // key -> { state, at, predictions }
const inFlight = new Map(); // key -> Promise

const stats = { hits: 0, misses: 0, upstreamCalls: 0, deduped: 0, errors: 0, notCached: 0 };

const ttlFor = state => (state === STATE_SUCCESS ? SUCCESS_TTL_MS : NEGATIVE_TTL_MS);

const cacheGet = key => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlFor(hit.state)) {
    cache.delete(key);
    return null;
  }
  return hit;
};

// Only ever called for states we are willing to remember. Errors are dropped on
// the floor deliberately - see the header.
const cachePut = (key, state, predictions) => {
  if (state === STATE_ERROR) {
    stats.notCached++;
    return;
  }
  cache.set(key, { state, at: Date.now(), predictions });
};

// ---- single-file rate limiter ----------------------------------------------
let queueTail = Promise.resolve();
let lastStartedAt = 0;

const schedule = task => {
  const run = queueTail.then(async () => {
    const wait = Math.max(0, lastStartedAt + MIN_UPSTREAM_INTERVAL_MS - Date.now());
    if (wait > 0) {
      await new Promise(r => {
        setTimeout(r, wait);
      });
    }
    lastStartedAt = Date.now();
    return task();
  });
  // keep the chain alive regardless of individual failures
  queueTail = run.then(() => undefined, () => undefined);
  return run;
};

const shortPlaceName = display => {
  const CA_POSTAL = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;
  const parts = String(display || '')
    .split(',')
    .map(p => p.trim())
    .filter(p => p && !/county$/i.test(p) && p !== 'United States' && p !== 'Canada' && !CA_POSTAL.test(p));
  if (parts.length <= 2) return parts.join(', ');
  return [parts[0], parts[parts.length - 1]].join(', ');
};

const addressLine = row => {
  const a = row && row.address;
  if (!a) return null;
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const city = a.city || a.town || a.village || a.hamlet || a.suburb;
  const region = a.state || a.province;
  const line = [street || null, city || null, [region, a.postcode].filter(Boolean).join(' ') || null]
    .filter(Boolean)
    .join(', ');
  return street && line ? line : null;
};

const toPredictions = rows =>
  (Array.isArray(rows) ? rows : [])
    .map(row => {
      const street = addressLine(row);
      const p = {
        id: `osm.${row.place_id}`,
        place_name: street || shortPlaceName(row.display_name),
        center: [parseFloat(row.lon), parseFloat(row.lat)],
        place_type: [street ? 'address' : 'place'],
        source: 'nominatim',
      };
      const bb = row.boundingbox; // [south, north, west, east] as strings
      if (Array.isArray(bb) && bb.length === 4) {
        p.bbox = [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])];
      }
      return p;
    })
    .filter(p => Number.isFinite(p.center[0]) && Number.isFinite(p.center[1]));

/**
 * One throttled, de-duplicated, correctly-cached Nominatim lookup.
 *
 * @returns {Promise<{state:string, predictions:Array}>} state is
 *   'success' | 'empty' | 'error'. Callers must treat 'error' as "upstream is
 *   unavailable", never as "there is no such place".
 */
const nominatimLookup = async (q, countryCodes = 'us') => {
  const key = `${countryCodes}|${String(q || '').trim().toLowerCase()}`;

  const cached = cacheGet(key);
  if (cached) {
    stats.hits++;
    return { state: cached.state, predictions: cached.predictions, cached: true };
  }
  stats.misses++;

  const pending = inFlight.get(key);
  if (pending) {
    stats.deduped++;
    return pending;
  }

  const work = schedule(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      stats.upstreamCalls++;
      const url =
        `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&limit=5` +
        `&countrycodes=${encodeURIComponent(countryCodes)}&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': NOMINATIM_UA } });
      if (!r.ok) {
        // 429 and 5xx are upstream conditions, not answers about geography.
        stats.errors++;
        return { state: STATE_ERROR, predictions: [], status: r.status };
      }
      let rows;
      try {
        rows = await r.json();
      } catch (e) {
        stats.errors++;
        return { state: STATE_ERROR, predictions: [], status: 'unparseable' };
      }
      const predictions = toPredictions(rows);
      const state = predictions.length ? STATE_SUCCESS : STATE_EMPTY;
      cachePut(key, state, predictions);
      return { state, predictions };
    } catch (e) {
      stats.errors++;
      return { state: STATE_ERROR, predictions: [], status: e && e.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, work);
  return work;
};

// eslint-disable-next-line no-underscore-dangle -- test seam, not part of the public API
const _resetForTests = () => {
  cache.clear();
  inFlight.clear();
  Object.keys(stats).forEach(k => {
    stats[k] = 0;
  });
  lastStartedAt = 0;
  queueTail = Promise.resolve();
};

/* eslint-disable no-underscore-dangle -- _cache/_resetForTests are test seams */
module.exports = {
  nominatimLookup,
  STATE_SUCCESS,
  STATE_EMPTY,
  STATE_ERROR,
  stats,
  _cache: cache,
  _resetForTests,
  NOMINATIM_URL,
  MIN_UPSTREAM_INTERVAL_MS,
};
