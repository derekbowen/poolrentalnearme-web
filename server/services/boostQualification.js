/**
 * Server-side boost qualification.
 * ────────────────────────────────
 * Resolves the live context (weather, water temp, availability) for a
 * listing and returns the same {run, reason} shape as `shouldBoostRun` in
 * src/util/listingBoost.js — so the server can pause boosts when real-world
 * conditions don't support a booking.
 *
 * This is the server counterpart to the pure client helper. Client code
 * should call `/api/boost/qualify` when it needs a live answer.
 */

const weather = require('./weather');
const waterTemp = require('./waterTempEstimator');

// Thresholds — keep these synced with src/config/boostConfig.js.
const MIN_PHOTOS = 3;
const MIN_OPEN_DAYS = 2;
const PREMIUM_MIN_OPEN_DAYS = 3;
const MIN_AIR_TEMP_F = 72;
const MIN_WATER_TEMP_F = 74;

/**
 * Decide whether a boost should be actively serving right now for a given
 * listing. Pulls in live weather + water temp. Any external-service failure
 * is treated as "don't block" — we never want a provider outage to silently
 * pause paid placements.
 *
 * @param {object} listing Sharetribe listing (from sdk.listings.show)
 * @param {object} extra { openDaysNext7 }
 */
const qualifyBoost = async (listing, { openDaysNext7 } = {}) => {
  const pd = listing?.attributes?.publicData || {};
  const boost = pd.boost;

  if (!boost?.active) {
    return { run: false, reason: 'not_active' };
  }

  const now = Date.now();
  if (boost.endsAt && new Date(boost.endsAt).getTime() < now) {
    return { run: false, reason: 'expired' };
  }

  // Photo count guard.
  const photoCount = listing?.relationships?.images?.data?.length || 0;
  if (photoCount < MIN_PHOTOS) {
    return { run: false, reason: 'insufficient_photos' };
  }

  // Availability guard.
  if (typeof openDaysNext7 === 'number') {
    const isPremium = boost.tier === 'premium';
    const required = isPremium ? PREMIUM_MIN_OPEN_DAYS : MIN_OPEN_DAYS;
    if (openDaysNext7 < required) {
      return { run: false, reason: 'fully_booked' };
    }
  }

  // Geolocation is required for weather checks. Missing → don't block.
  const geo = listing?.attributes?.geolocation;
  if (!geo?.lat || !geo?.lng) {
    return { run: true, reason: 'ok_no_geo' };
  }

  const forecast = await weather.getForecast(geo.lat, geo.lng);
  if (!forecast) {
    return { run: true, reason: 'ok_no_forecast' };
  }

  const bookability = weather.summarizeBookability(forecast);
  if (!bookability.bookableToday) {
    return { run: false, reason: `weather_${bookability.reason}` };
  }

  // Water temp check — only gate on it if the estimator actually returned
  // a value. Missing water temp defaults to "don't block".
  const poolAttrs = {
    poolType: pd.poolType || 'in-ground',
    hasHeater: !!pd.hasHeater,
    isSaltwater: !!pd.isSaltwater,
    hasCover: !!pd.hasCover,
    volumeGallons: pd.volumeGallons || null,
    depthFt: pd.depthFt || null,
    shading: pd.shading || 'partial',
  };

  const water = await waterTemp.estimateWaterTemp(forecast, poolAttrs);
  if (water && water.waterTempF < MIN_WATER_TEMP_F) {
    return {
      run: false,
      reason: 'water_too_cold',
      detail: `${water.waterTempF}°F (${water.confidence})`,
    };
  }

  return { run: true, reason: 'ok', water, air: forecast.daily[0] };
};

module.exports = { qualifyBoost };
