/**
 * GET /api/weather/pool-forecast?listingId=<uuid>
 * ────────────────────────────────────────────────
 * Returns the weather + AI water temp estimate for a single listing.
 *
 * Response shape:
 * {
 *   location: { lat, lng },
 *   fetchedAt: ISO8601,
 *   air: { todayHighF, todayLowF, rainPct, 7day: [...] },
 *   water: { tempF, confidence, trend, swimmable, rationale },
 *   bookable: { today, week, reason },
 *   cacheHit: boolean
 * }
 *
 * This endpoint is PUBLIC — guests viewing a listing page will hit it.
 * Rate-limited by in-memory debounce (30s per listingId per IP) because the
 * underlying services are also cached, so spamming this endpoint is cheap
 * but still worth throttling at the HTTP layer.
 */

const { getTrustedSdk, getSdk } = require('../../api-util/sdk');
const weather = require('../../services/weather');
const waterTemp = require('../../services/waterTempEstimator');

// Simple per-IP+listing debounce, 30s.
const debounce = new Map(); // "ip|listingId" -> timestamp
const DEBOUNCE_MS = 30 * 1000;
const DEBOUNCE_MAX = 5000;

const pruneDebounce = () => {
  if (debounce.size <= DEBOUNCE_MAX) return;
  const cutoff = Date.now() - DEBOUNCE_MS;
  for (const [k, t] of debounce.entries()) {
    if (t < cutoff) debounce.delete(k);
  }
};

const extractPoolAttrs = listing => {
  const pd = listing?.attributes?.publicData || {};
  return {
    poolType: pd.poolType || pd.pool_type || 'in-ground', // default assumption
    hasHeater: !!(pd.hasHeater || pd.amenities?.includes?.('heater')),
    isSaltwater: !!(pd.isSaltwater || pd.sanitization === 'saltwater'),
    hasCover: !!(pd.hasCover || pd.amenities?.includes?.('pool-cover')),
    volumeGallons: pd.volumeGallons || null,
    depthFt: pd.depthFt || pd.maxDepthFt || null,
    shading: pd.shading || 'partial', // sun|partial|shade
  };
};

const extractLatLng = listing => {
  const geo = listing?.attributes?.geolocation;
  if (geo?.lat && geo?.lng) return { lat: geo.lat, lng: geo.lng };
  return null;
};

module.exports = async (req, res) => {
  const { listingId } = req.query;
  if (!listingId) {
    return res.status(400).json({ error: 'listingId required' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const debounceKey = `${ip}|${listingId}`;
  const lastHit = debounce.get(debounceKey) || 0;
  if (Date.now() - lastHit < DEBOUNCE_MS) {
    return res.status(429).json({ error: 'rate_limited', retryAfterMs: DEBOUNCE_MS });
  }
  debounce.set(debounceKey, Date.now());
  pruneDebounce();

  try {
    // Public SDK is fine — published listings are readable without auth.
    let sdk;
    try {
      sdk = await getTrustedSdk(req);
    } catch {
      sdk = getSdk(req, res);
    }

    const showRes = await sdk.listings.show({ id: listingId });
    const listing = showRes.data.data;
    if (!listing) {
      return res.status(404).json({ error: 'listing_not_found' });
    }

    const latLng = extractLatLng(listing);
    if (!latLng) {
      return res.status(422).json({ error: 'listing_has_no_geolocation' });
    }

    const forecast = await weather.getForecast(latLng.lat, latLng.lng);
    if (!forecast) {
      return res.status(503).json({ error: 'forecast_unavailable' });
    }

    const poolAttrs = extractPoolAttrs(listing);
    // Run water temp estimate in parallel with bookability summary.
    const [water, bookability] = await Promise.all([
      waterTemp.estimateWaterTemp(forecast, poolAttrs),
      Promise.resolve(weather.summarizeBookability(forecast)),
    ]);

    const today = forecast.daily[0] || {};
    const response = {
      location: forecast.location,
      fetchedAt: forecast.fetchedAt,
      air: {
        todayHighF: today.tempMaxF,
        todayLowF: today.tempMinF,
        rainPct: today.precipProbPct,
        sevenDay: forecast.daily.map(d => ({
          date: d.date,
          highF: d.tempMaxF,
          lowF: d.tempMinF,
          rainPct: d.precipProbPct,
        })),
      },
      water,
      bookable: bookability,
    };

    return res.json(response);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[weather/pool-forecast] error:', err);
    return res.status(500).json({ error: 'internal_error', detail: err.message });
  }
};
