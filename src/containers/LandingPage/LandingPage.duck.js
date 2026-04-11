import { storableError } from '../../util/errors';
import { createInstance, types as sdkTypes } from '../../util/sdkLoader';

const { LatLng } = sdkTypes;

export const ASSET_NAME = 'landing-page';

// ─── Action types ───────────────────────────────────────
const FETCH_FEATURED_LISTINGS_REQUEST = 'app/LandingPage/FETCH_FEATURED_LISTINGS_REQUEST';
const FETCH_FEATURED_LISTINGS_SUCCESS = 'app/LandingPage/FETCH_FEATURED_LISTINGS_SUCCESS';
const FETCH_FEATURED_LISTINGS_ERROR = 'app/LandingPage/FETCH_FEATURED_LISTINGS_ERROR';
const SET_USER_LOCATION = 'app/LandingPage/SET_USER_LOCATION';
const SET_USER_LOCATION_ERROR = 'app/LandingPage/SET_USER_LOCATION_ERROR';
const SET_MARKET_SNAPSHOT = 'app/LandingPage/SET_MARKET_SNAPSHOT';

// ─── Initial state ──────────────────────────────────────
const initialState = {
  featuredListingIds: [],
  fetchFeaturedListingsInProgress: false,
  fetchFeaturedListingsError: null,
  userLocation: null, // { lat, lng, city, region, country }
  userLocationError: null,
  marketSnapshot: null, // { region, totalPools, avgPriceCents, minPriceCents, maxPriceCents, demandLevel, surgeMultiplier, explanation, computedAt }
};

// ─── Reducer ────────────────────────────────────────────
export default function reducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case FETCH_FEATURED_LISTINGS_REQUEST:
      return { ...state, fetchFeaturedListingsInProgress: true, fetchFeaturedListingsError: null };
    case FETCH_FEATURED_LISTINGS_SUCCESS:
      return { ...state, fetchFeaturedListingsInProgress: false, featuredListingIds: payload };
    case FETCH_FEATURED_LISTINGS_ERROR:
      return { ...state, fetchFeaturedListingsInProgress: false, fetchFeaturedListingsError: payload };
    case SET_USER_LOCATION:
      return { ...state, userLocation: payload, userLocationError: null };
    case SET_USER_LOCATION_ERROR:
      return { ...state, userLocationError: payload };
    case SET_MARKET_SNAPSHOT:
      return { ...state, marketSnapshot: payload };
    default:
      return state;
  }
}

// ─── Action creators ────────────────────────────────────
const fetchFeaturedListingsRequest = () => ({ type: FETCH_FEATURED_LISTINGS_REQUEST });
const fetchFeaturedListingsSuccess = (listingIds) => ({ type: FETCH_FEATURED_LISTINGS_SUCCESS, payload: listingIds });
const fetchFeaturedListingsError = (error) => ({ type: FETCH_FEATURED_LISTINGS_ERROR, payload: error });
const setMarketSnapshot = (snapshot) => ({ type: SET_MARKET_SNAPSHOT, payload: snapshot });
const setUserLocation = (location) => ({ type: SET_USER_LOCATION, payload: location });
const setUserLocationError = (error) => ({ type: SET_USER_LOCATION_ERROR, payload: error });

// ─── Live marketplace client ID (for fetching real listings) ────
const LIVE_CLIENT_ID = 'ead6eac7-aa96-4fb2-9f3d-f2e147c8672b';

// Create a separate SDK instance for the live marketplace
let liveSdk = null;
const getLiveSdk = () => {
  if (!liveSdk) {
    liveSdk = createInstance({
      clientId: LIVE_CLIENT_ID,
      baseUrl: 'https://flex-api.sharetribe.com',
    });
  }
  return liveSdk;
};

// ─── Thunks ─────────────────────────────────────────────

/**
 * Look up the visitor's approximate location from their IP address using a
 * free public geolocation service. Dispatches the result into Redux state so
 * downstream code (listings query, distance labels, email capture) can react.
 *
 * Uses ipapi.co as primary, ipwho.is as fallback. Both are free, no-auth, and
 * CORS-friendly from the browser.
 */
export const fetchUserLocation = () => async (dispatch) => {
  const sources = [
    {
      url: 'https://ipapi.co/json/',
      parse: (d) => ({
        lat: d.latitude,
        lng: d.longitude,
        city: d.city,
        region: d.region,
        country: d.country_name,
      }),
    },
    {
      url: 'https://ipwho.is/',
      parse: (d) => ({
        lat: d.latitude,
        lng: d.longitude,
        city: d.city,
        region: d.region,
        country: d.country,
      }),
    },
  ];

  for (const source of sources) {
    try {
      const res = await fetch(source.url);
      if (!res.ok) continue;
      const data = await res.json();
      const loc = source.parse(data);
      if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        dispatch(setUserLocation(loc));
        return loc;
      }
    } catch (e) {
      // try next source
    }
  }

  dispatch(setUserLocationError('Unable to determine visitor location'));
  return null;
};

/**
 * Derive a live market snapshot from freshly-fetched listings + user location.
 *
 * This is the data that powers the "Live Market Intelligence" banner in the
 * PoolBookingExperience component: how many pools in the metro, average price,
 * demand level, surge multiplier, and a one-line AI-style explanation.
 *
 * The surge multiplier is a simple heuristic for now (seasonality × day-of-week).
 * In Phase 6 this will be replaced by a nightly cron that reads weather,
 * holidays, booking velocity, and competitor pricing, writing results to
 * each listing's publicData.dynamicPricing.surgeMultiplier.
 */
const computeMarketSnapshot = (listings, userLocation) => {
  if (!Array.isArray(listings) || listings.length === 0) return null;

  const prices = listings
    .map(l => l?.attributes?.price?.amount)
    .filter(n => Number.isFinite(n) && n > 0);

  if (prices.length === 0) return null;

  const sum = prices.reduce((a, b) => a + b, 0);
  const avgPriceCents = Math.round(sum / prices.length);
  const minPriceCents = Math.min(...prices);
  const maxPriceCents = Math.max(...prices);

  // Simple surge heuristic:
  //   +15% Jun–Aug (peak swim season, northern hemisphere)
  //   +10% Fri/Sat/Sun
  //   -10% Nov–Feb (off-season)
  // Clamped to [0.85, 1.40].
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  let multiplier = 1.0;
  if (month >= 5 && month <= 7) multiplier += 0.15;           // Jun-Aug
  else if (month >= 10 || month <= 1) multiplier -= 0.10;      // Nov-Feb
  if ([0, 5, 6].includes(dayOfWeek)) multiplier += 0.10;       // Fri/Sat/Sun

  multiplier = Math.max(0.85, Math.min(1.40, multiplier));
  const surgeDelta = Math.round((multiplier - 1) * 100);

  let demandLevel = 'normal';
  if (multiplier >= 1.20) demandLevel = 'surge';
  else if (multiplier >= 1.10) demandLevel = 'high';
  else if (multiplier < 1.0) demandLevel = 'low';

  const region = userLocation?.city || userLocation?.region || 'your area';

  const explanationParts = [];
  if (demandLevel === 'surge' || demandLevel === 'high') {
    explanationParts.push(`Demand is ${demandLevel} in ${region}`);
  } else if (demandLevel === 'low') {
    explanationParts.push(`Off-season pricing in ${region} — great time to book`);
  } else {
    explanationParts.push(`Normal pricing in ${region}`);
  }
  explanationParts.push(`${listings.length} pools listed · avg $${Math.round(avgPriceCents / 100)}/hr`);

  return {
    region,
    totalPools: listings.length,
    avgPriceCents,
    minPriceCents,
    maxPriceCents,
    demandLevel,
    surgeMultiplier: multiplier,
    surgeDeltaPct: surgeDelta,
    explanation: explanationParts.join(' · '),
    computedAt: now.toISOString(),
  };
};

/**
 * Fetch featured listings. If an `origin` (lat/lng) is supplied, results are
 * ordered by distance from that point via the SDK's `origin` query param.
 */
export const fetchFeaturedListings = (origin = null) => (dispatch) => {
  dispatch(fetchFeaturedListingsRequest());

  const sdk = getLiveSdk();

  const queryParams = {
    perPage: 16,
    include: ['images'],
    'fields.image': [
      'variants.scaled-small',
      'variants.scaled-medium',
    ],
    'limit.images': 1,
  };

  if (origin && typeof origin.lat === 'number' && typeof origin.lng === 'number') {
    queryParams.origin = new LatLng(origin.lat, origin.lng);
  }

  return sdk.listings
    .query(queryParams)
    .then((response) => {
      const listings = response.data.data;
      const included = response.data.included || [];

      console.log('🏊 Featured listings API response:', listings.length, 'listings');
      if (listings.length > 0) {
        console.log('🏊 First listing:', listings[0].attributes?.title);
      }

      // Build listing objects with images attached (can't use addMarketplaceEntities
      // since this is from a different SDK instance)
      const processedListings = listings.map((listing) => {
        const imageRels = listing.relationships?.images?.data || [];
        const images = imageRels
          .map((ref) => included.find(
            (inc) => inc.type === 'image' && inc.id.uuid === ref.id.uuid
          ))
          .filter(Boolean);

        return {
          id: listing.id,
          type: 'listing',
          attributes: listing.attributes,
          images,
        };
      });

      console.log('🏊 Processed:', processedListings.length, 'listings with images');
      dispatch(fetchFeaturedListingsSuccess(processedListings));

      // Derive and dispatch the live market snapshot from the real data.
      // `origin` here is the full userLocation object (passed from LandingPage.js).
      const snapshot = computeMarketSnapshot(processedListings, origin);
      if (snapshot) {
        console.log('📊 Market snapshot:', snapshot);
        dispatch(setMarketSnapshot(snapshot));
      }

      return processedListings;
    })
    .catch((e) => {
      console.error('🏊 Featured listings ERROR:', e);
      dispatch(fetchFeaturedListingsError(storableError(e)));
    });
};

// No loadData needed — PremiumLandingPage doesn't use hosted page assets.
// Listings are fetched client-side via useEffect in LandingPage.js
