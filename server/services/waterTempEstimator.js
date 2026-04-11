/**
 * Water temperature estimator.
 * ────────────────────────────
 * Takes a Tomorrow.io forecast + pool attributes and returns an estimated
 * water temperature (°F). Uses Claude Haiku because this is fast, cheap
 * reasoning — we call it once per listing per ~6 hours, cached.
 *
 * Why AI instead of a formula:
 * Water temp depends on ~15 interacting variables (3-day avg air temp,
 * solar gain, cloud cover, wind chill, pool volume, depth, surface area,
 * cover usage, heater BTUs, heater runtime, saltwater vs chlorine,
 * in-ground vs above-ground, shading, humidity). A hand-rolled formula
 * gets ~60% of the way there but falls over on edge cases. Claude Haiku
 * handles all of it in one call and explains its reasoning — which we
 * surface to hosts when they question the number.
 *
 * Cost: ~$0.0003 per estimate at Haiku pricing. 10,000 estimates/day = $3.
 *
 * Env: ANTHROPIC_API_KEY (already set for listing generation)
 */

const Anthropic = require('@anthropic-ai/sdk').default;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX_ENTRIES = 5000;
const MODEL = 'claude-haiku-4-5-20251001';

const cache = new Map(); // key -> { fetchedAt, payload }

const pruneCache = () => {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
  const dropCount = Math.ceil(cache.size * 0.2);
  for (let i = 0; i < dropCount; i++) cache.delete(entries[i][0]);
};

/**
 * Build a compact cache key from pool attributes. If any relevant attribute
 * changes (heater added, pool drained, cover installed), the key changes
 * and a fresh estimate is computed.
 */
const buildCacheKey = ({ lat, lng, poolAttrs, forecastFetchedAt }) => {
  const rounded = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const attrs = [
    poolAttrs.poolType || '?',
    poolAttrs.hasHeater ? 'H' : '',
    poolAttrs.isSaltwater ? 'S' : '',
    poolAttrs.hasCover ? 'C' : '',
    poolAttrs.volumeGallons || '?',
    poolAttrs.depthFt || '?',
    poolAttrs.shading || '?',
  ].join('|');
  // Round forecastFetchedAt to the nearest 6 hours so the cache key lines up
  // with our TTL — forecast refreshes every hour but the water temp response
  // doesn't meaningfully change inside a 6-hour window.
  const bucket = Math.floor(new Date(forecastFetchedAt).getTime() / CACHE_TTL_MS);
  return `${rounded}|${attrs}|${bucket}`;
};

/**
 * Estimate pool water temperature.
 *
 * @param {Object} forecast  normalized forecast from services/weather.js
 * @param {Object} poolAttrs { poolType, hasHeater, isSaltwater, hasCover, volumeGallons, depthFt, shading }
 * @returns {Promise<null | {
 *   waterTempF: number,
 *   confidence: 'low'|'medium'|'high',
 *   trend: 'warming'|'stable'|'cooling',
 *   swimmable: boolean,
 *   rationale: string,
 *   estimatedAt: string,
 *   modelUsed: string,
 * }>}
 */
const estimateWaterTemp = async (forecast, poolAttrs = {}) => {
  if (!forecast?.daily?.length) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[waterTemp] ANTHROPIC_API_KEY not set — returning null');
    return null;
  }

  const key = buildCacheKey({
    lat: forecast.location.lat,
    lng: forecast.location.lng,
    poolAttrs,
    forecastFetchedAt: forecast.fetchedAt,
  });

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.payload;
  }

  // Trim the forecast payload to what the model actually needs.
  const trimmed = {
    daily: forecast.daily.slice(0, 5).map(d => ({
      date: d.date,
      highF: d.tempMaxF,
      lowF: d.tempMinF,
      avgF: d.tempAvgF,
      rainPct: d.precipProbPct,
      sunHours: d.sunshineHours,
      cloudPct: d.cloudCoverAvgPct,
    })),
    location: forecast.location,
  };

  const systemPrompt = `You are a pool water temperature estimator for a pool rental marketplace. You will receive a 5-day weather forecast and pool attributes. Respond ONLY with valid JSON matching this schema:

{
  "waterTempF": number,       // current estimated water temp, integer
  "confidence": "low"|"medium"|"high",
  "trend": "warming"|"stable"|"cooling",   // over the next 48 hours
  "swimmable": boolean,        // true if water >= 74°F AND forecast supports swimming
  "rationale": string          // one sentence, plain English, max 140 chars
}

Rules of thumb you should apply:
- Unheated pool water lags the 3-day average air temperature by ~2-5°F below it.
- Heated pools hold 82-86°F regardless of air temp (unless heater is off).
- Saltwater pools feel 1-2°F warmer due to higher specific heat but measure the same.
- Pool covers add 5-10°F overnight retention.
- Shaded pools run 3-6°F cooler than sunny pools.
- Larger volume = more thermal inertia (slower to warm, slower to cool).
- Do not exceed 92°F unless explicitly heated and in a hot climate.
- Do not go below 55°F unless forecast clearly supports it.
- "Swimmable" should be false below 74°F regardless of heater claims — most guests won't enter cold water.
- Confidence should drop to "low" when data is sparse or contradictory.

Be conservative. A host would rather see "72°F, cool" and have a guest pleasantly surprised than see "78°F, swimmable" and have a guest complain.`;

  const userPrompt = `Pool attributes:
${JSON.stringify(poolAttrs, null, 2)}

Forecast (${trimmed.location.lat}, ${trimmed.location.lng}):
${JSON.stringify(trimmed.daily, null, 2)}

Estimate the current water temperature.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content?.[0]?.text?.trim() || '';
    // Parse JSON — strip any accidental markdown fences.
    const jsonText = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonText);

    const result = {
      waterTempF: Math.round(parsed.waterTempF),
      confidence: parsed.confidence || 'medium',
      trend: parsed.trend || 'stable',
      swimmable: !!parsed.swimmable,
      rationale: parsed.rationale || '',
      estimatedAt: new Date().toISOString(),
      modelUsed: MODEL,
    };

    cache.set(key, { fetchedAt: now, payload: result });
    pruneCache();
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[waterTemp] estimator failed:', err.message);
    return null;
  }
};

module.exports = {
  estimateWaterTemp,
};
