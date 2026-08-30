// Local US geographic resolver.
//
// Why this exists: geocodeSuggest was Census-first with an OpenStreetMap
// (Nominatim) fallback, and Census only matches STREET addresses. That made
// every city, town, ZIP and state search depend on Nominatim. When OSM
// 429-blocked our IP, ordinary US search had nothing to fall back on, and the
// empty result got cached for 24h - so a single throttled minute could take
// geographic search down for a day.
//
// This resolver answers the overwhelmingly common US queries - ZIP, city+state,
// state - with no network call at all. Nominatim stays available for everything
// else (street addresses, Canada, odd spellings) but is no longer in the
// critical path.
//
// Data: US Census 2023 Gazetteer (public domain), generated offline.
//  - places      : incorporated places + CDPs
//  - cousubs     : active governmental county subdivisions. New England towns
//                  live ONLY here - NH has just 100 Census "places" and Windham
//                  (a real town with a real host in it) is not one of them.
//  - ZCTAs       : ZIP code tabulation areas
//
// Matching is EXACT on a normalized name. No fuzzy/substring matching: a near
// miss must return nothing rather than send a guest to a similarly-spelled town
// in another state.

const STATES = require('./states.json');
const ZIPS = require('./zips.json');
const CITIES = require('./cities.json');

const STATE_BY_NAME = {};
Object.keys(STATES).forEach(abbr => {
  STATE_BY_NAME[STATES[abbr].name.toLowerCase()] = abbr;
});

// A city's Census extent is its legal boundary, which for a small town is only
// a few km across - too tight to be a useful marketplace search. Widen to a
// sensible "pools near here" area without letting a huge consolidated city
// swallow half a state.
const MIN_SEARCH_RADIUS_KM = 8;
const MAX_SEARCH_RADIUS_KM = 60;

const searchRadiusKm = km =>
  Math.min(MAX_SEARCH_RADIUS_KM, Math.max(MIN_SEARCH_RADIUS_KM, Number(km) || 0));

const KM_PER_DEG_LAT = 110.574;

const round5 = n => Math.round(n * 1e5) / 1e5;

// [west, south, east, north] - the order the client and Mapbox-shaped
// predictions already use.
const bboxFrom = (lat, lng, km) => {
  const dLat = km / KM_PER_DEG_LAT;
  const dLng = km / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [
    round5(lng - dLng),
    round5(lat - dLat),
    round5(lng + dLng),
    round5(lat + dLat),
  ];
};

/**
 * Normalize a raw search string for matching.
 * Folds case, accents, punctuation, commas and repeated whitespace, so
 * "  windham,   n.h. " and "Windham NH" become the same thing.
 */
const normalize = raw =>
  String(raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const isStateAbbr = token => !!(token && STATES[token.toUpperCase()]);

/** "03087" or "03087-1234" -> "03087"; otherwise null. */
const asZip = q => {
  const m = /^(\d{5})(?:\s*-\s*\d{4})?$/.exec(String(q || '').trim());
  return m ? m[1] : null;
};

const statePrediction = abbr => {
  const s = STATES[abbr];
  if (!s) return null;
  return {
    id: `usgeo.state.${abbr}`,
    place_name: s.name,
    center: [s.lng, s.lat],
    place_type: ['region'],
    bbox: s.bbox,
    source: 'local',
  };
};

const zipPrediction = zip => {
  const z = ZIPS[zip];
  if (!z) return null;
  const [lat, lng, st, km] = z;
  const r = searchRadiusKm(km);
  return {
    id: `usgeo.zip.${zip}`,
    place_name: st ? `${zip}, ${STATES[st] ? STATES[st].name : st}` : zip,
    center: [lng, lat],
    place_type: ['postcode'],
    bbox: bboxFrom(lat, lng, r),
    source: 'local',
  };
};

const cityPrediction = entry => {
  const [st, lat, lng, km, disp] = entry;
  const r = searchRadiusKm(km);
  return {
    id: `usgeo.city.${st}.${normalize(disp).replace(/ /g, '-')}`,
    place_name: `${disp}, ${STATES[st] ? STATES[st].name : st}`,
    center: [lng, lat],
    place_type: ['place'],
    bbox: bboxFrom(lat, lng, r),
    source: 'local',
  };
};

/** Split a normalized query into [cityPart, stateAbbr] when it names a state. */
const splitCityState = norm => {
  const tokens = norm.split(' ');
  if (tokens.length < 2) return null;

  // trailing 2-letter abbreviation: "windham nh"
  const last = tokens[tokens.length - 1];
  if (isStateAbbr(last)) {
    return [tokens.slice(0, -1).join(' '), last.toUpperCase()];
  }
  // trailing full state name, possibly multi-word: "windham new hampshire"
  for (let take = Math.min(3, tokens.length - 1); take >= 1; take--) {
    const tail = tokens.slice(tokens.length - take).join(' ');
    const abbr = STATE_BY_NAME[tail];
    if (abbr) {
      return [tokens.slice(0, tokens.length - take).join(' '), abbr];
    }
  }
  return null;
};

/**
 * Resolve a query against local US data.
 *
 * @returns {Array} prediction objects (possibly empty). An empty array means
 *   "not confidently resolvable locally" - the caller should try upstream.
 */
const resolveLocal = (rawQuery, limit = 5) => {
  const raw = String(rawQuery || '').trim();
  if (!raw) return [];

  // ZIP first: unambiguous, and the digits would survive normalization anyway.
  const zip = asZip(raw);
  if (zip) {
    const p = zipPrediction(zip);
    return p ? [p] : [];
  }

  const norm = normalize(raw);
  if (!norm) return [];

  // bare state, by abbreviation ("nh") or full name ("new hampshire")
  if (norm.length === 2 && isStateAbbr(norm)) {
    const p = statePrediction(norm.toUpperCase());
    return p ? [p] : [];
  }
  if (STATE_BY_NAME[norm]) {
    const p = statePrediction(STATE_BY_NAME[norm]);
    return p ? [p] : [];
  }

  // city + state
  const split = splitCityState(norm);
  if (split) {
    const [cityName, abbr] = split;
    const list = CITIES[cityName];
    if (list) {
      const hit = list.find(e => e[0] === abbr);
      if (hit) return [cityPrediction(hit)];
    }
    // A named state with an unrecognised city is still better answered by the
    // state than by silence, but only when the city part is empty; otherwise
    // fall through so upstream can try the full string.
    if (!cityName) {
      const p = statePrediction(abbr);
      return p ? [p] : [];
    }
    return [];
  }

  // bare city name: return each state that has one, biggest first, so
  // "springfield" offers a real choice instead of an arbitrary pick.
  const list = CITIES[norm];
  if (list && list.length) {
    return list
      .slice()
      .sort((a, b) => b[3] - a[3])
      .slice(0, limit)
      .map(cityPrediction);
  }

  return [];
};

/**
 * Should this query be allowed past the minimum-length guard?
 * The guard exists to stop 1-2 character noise from hitting upstream on every
 * keystroke. Valid two-letter state abbreviations are real searches and must
 * not be swallowed by it - "NH" returned nothing before this.
 */
const isShortButValid = rawQuery => {
  const raw = String(rawQuery || '').trim();
  if (asZip(raw)) return true;
  const norm = normalize(raw);
  return norm.length === 2 && isStateAbbr(norm);
};

module.exports = {
  normalize,
  resolveLocal,
  isShortButValid,
  isStateAbbr,
  asZip,
  searchRadiusKm,
  bboxFrom,
  STATES,
  _counts: {
    states: Object.keys(STATES).length,
    zips: Object.keys(ZIPS).length,
    cities: Object.keys(CITIES).length,
  },
};
