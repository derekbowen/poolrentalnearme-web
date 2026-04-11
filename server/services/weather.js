/**
 * Tomorrow.io weather service wrapper.
 * ────────────────────────────────────
 * Fetches 6-day hourly/daily forecasts from Tomorrow.io and caches them
 * in-memory keyed by rounded lat/lng. The cache TTL matches the Tomorrow.io
 * update cadence (~1 hour for most fields) so we never burn API quota on
 * two requests for the same backyard in the same hour.
 *
 * Error handling: every failure returns `null` and logs — the boost system
 * treats missing forecast as "don't block," not "block." We never want a
 * weather provider outage to break search rankings.
 *
 * Env: TOMORROW_IO_API_KEY
 */

const FORECAST_URL = 'https://api.tomorrow.io/v4/weather/forecast';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_ENTRIES = 2000; // rough cap; LRU-ish prune when exceeded

// Round to ~1.1km grid — two pools within 1km share a cache entry.
const GRID = 0.01;
const gridKey = (lat, lng) =>
  `${Math.round(lat / GRID) * GRID},${Math.round(lng / GRID) * GRID}`;

const cache = new Map(); // key -> { fetchedAt, payload }

const pruneCache = () => {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  // Drop the oldest 20% when we overflow.
  const entries = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  const dropCount = Math.ceil(cache.size * 0.2);
  for (let i = 0; i < dropCount; i++) cache.delete(entries[i][0]);
};

/**
 * Fetch forecast for a location. Cached for 1 hour.
 * Returns normalized shape (not raw Tomorrow.io) so callers don't couple
 * to the vendor format.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<null | {
 *   fetchedAt: string,
 *   location: { lat: number, lng: number },
 *   daily: Array<{ date: string, tempMaxF: number, tempMinF: number, precipProbPct: number, weatherCode: number, sunshineHours: number|null }>,
 *   hourly: Array<{ time: string, tempF: number, precipProbPct: number, cloudCoverPct: number }>,
 * }>}
 */
const getForecast = async (lat, lng) => {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const apiKey = process.env.TOMORROW_IO_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[weather] TOMORROW_IO_API_KEY not set — skipping forecast');
    return null;
  }

  const key = gridKey(lat, lng);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.payload;
  }

  try {
    // Tomorrow.io uses metric by default; we convert to Fahrenheit client-side
    // so the cache key stays vendor-agnostic.
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      apikey: apiKey,
      units: 'imperial', // returns tempF directly
      timesteps: '1d,1h',
    });

    const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[weather] Tomorrow.io ${res.status} for ${key}`);
      return null;
    }

    const raw = await res.json();
    const normalized = normalize(raw, lat, lng);
    cache.set(key, { fetchedAt: now, payload: normalized });
    pruneCache();
    return normalized;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[weather] fetch failed:', err.message);
    return null;
  }
};

/**
 * Normalize Tomorrow.io v4 forecast into the shape the rest of PRNM expects.
 * Gracefully tolerates missing fields — some free-tier accounts don't get
 * every value.
 */
const normalize = (raw, lat, lng) => {
  const timelines = raw?.timelines || {};
  const dailyRaw = timelines.daily || [];
  const hourlyRaw = timelines.hourly || [];

  const daily = dailyRaw.slice(0, 7).map(d => {
    const v = d.values || {};
    return {
      date: d.time?.slice(0, 10) || null,
      tempMaxF: v.temperatureMax ?? v.temperatureApparentMax ?? null,
      tempMinF: v.temperatureMin ?? v.temperatureApparentMin ?? null,
      tempAvgF: v.temperatureAvg ?? null,
      precipProbPct: v.precipitationProbabilityAvg ?? v.precipitationProbability ?? 0,
      weatherCode: v.weatherCodeMax ?? v.weatherCode ?? null,
      sunshineHours: v.sunshineDuration != null ? v.sunshineDuration / 3600 : null,
      cloudCoverAvgPct: v.cloudCoverAvg ?? null,
    };
  });

  const hourly = hourlyRaw.slice(0, 48).map(h => {
    const v = h.values || {};
    return {
      time: h.time,
      tempF: v.temperature ?? null,
      precipProbPct: v.precipitationProbability ?? 0,
      cloudCoverPct: v.cloudCover ?? null,
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    location: { lat, lng },
    daily,
    hourly,
  };
};

/**
 * Quick summary for boost qualification — "is today warm enough to swim?"
 * Returns { bookableToday, bookableWeek, reason } using simple thresholds.
 * More nuanced logic lives in waterTempEstimator.
 */
const summarizeBookability = forecast => {
  if (!forecast || !forecast.daily?.length) {
    return { bookableToday: true, bookableWeek: true, reason: 'no_data' };
  }
  const today = forecast.daily[0];
  const warmEnough = (today.tempMaxF ?? 80) >= 72;
  const dryEnough = (today.precipProbPct ?? 0) < 70;

  const weekWarmDays = forecast.daily.filter(d => (d.tempMaxF ?? 0) >= 72).length;

  return {
    bookableToday: warmEnough && dryEnough,
    bookableWeek: weekWarmDays >= 3,
    reason:
      !warmEnough ? 'cold' : !dryEnough ? 'rainy' : weekWarmDays < 3 ? 'cold_week' : 'ok',
  };
};

module.exports = {
  getForecast,
  summarizeBookability,
};
