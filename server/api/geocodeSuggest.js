// c133: same-origin geocoding proxy backed by the US Census Bureau geocoder.
// Added because the Google Maps key has billing disabled (REQUEST_DENIED on every
// lookup), which hard-blocked the listing wizard's address step for all new hosts.
// Census is keyless, free, public-domain and US-only — which matches the marketplace.
//
// c149: Census only matches STREET addresses — city/zip queries ("Modesto, CA")
// returned zero predictions, so Nominatim (OSM) was added as a fallback for place
// queries.
//
// c193: that made every city, town, ZIP and state search depend on OSM. When
// Nominatim 429-blocked our IP, ordinary US search had nothing left, and the
// resulting empty array was cached for 24h — one throttled minute could take
// geographic search down for a day. A New Hampshire host reported it as "I still
// don't see anything for myself or NH".
//
// Resolution order is now:
//     query -> normalize -> LOCAL US gazetteer (ZIP / city+state / state)
//           -> Census (street addresses)
//           -> throttled, de-duplicated Nominatim (everything else)
//
// Nominatim is no longer in the critical path for ordinary US search: with the
// local resolver, "Windham NH", "03087", "NH" and "New Hampshire" all answer
// with zero network calls. See server/api-util/usgeo and geoUpstream.
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

const usgeo = require('../api-util/usgeo');
const { nominatimLookup } = require('../api-util/geoUpstream');

// Canada launch: Census is US-only and fuzzy-matches across the border — a host
// typing "100 King Street West Hamilton Ontario" was offered Hamilton, OHIO and
// would have listed their pool in the wrong country. When the query names a
// Canadian province, postal code or the country itself, skip Census entirely and
// search Canada only. Everything else stays US-first, exactly as before.
const CA_PROVINCES = 'ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|labrador|prince edward island|yukon|nunavut|northwest territories';
const CA_POSTAL = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;
const CA_ABBR = /(^|[\s,])(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)([\s,]|$)/; // case-sensitive: "on" the word is not a province
const looksCanadian = q =>
  new RegExp(`\\b(canada|${CA_PROVINCES})\\b`, 'i').test(q) || CA_POSTAL.test(q) || CA_ABBR.test(q);

const titleCase = s =>
  String(s || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase());

const formatAddress = matched => {
  // Census returns "610 HAMILTON ST, ALLENTOWN, PA, 18101" — make it granny-friendly.
  const parts = String(matched || '').split(',').map(p => p.trim());
  if (parts.length >= 4) {
    const [street, city, state, zip] = parts;
    return `${titleCase(street)}, ${titleCase(city)}, ${state.toUpperCase()} ${zip}`;
  }
  return titleCase(matched);
};

const censusLookup = async q => {
  const url = `${CENSUS_URL}?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    const data = await r.json();
    const matches = (data && data.result && data.result.addressMatches) || [];
    return matches.slice(0, 5).map(m => ({
      id: `census.${String(m.matchedAddress || '').replace(/[^A-Za-z0-9]+/g, '-')}`,
      place_name: formatAddress(m.matchedAddress),
      center: [m.coordinates.x, m.coordinates.y],
      place_type: ['address'],
      source: 'census',
    }));
  } catch (e) {
    return null; // upstream problem, not "no such address"
  } finally {
    clearTimeout(timer);
  }
};

module.exports = async (req, res) => {
  const q = String(req.query.q || '').trim();

  // The length guard stops 1-2 character noise reaching any upstream on every
  // keystroke. Valid two-letter state abbreviations and ZIPs are real searches
  // and must not be swallowed by it — "NH" returned nothing before c193.
  if (q.length < 4 && !usgeo.isShortButValid(q)) {
    return res.status(200).json({ predictions: [] });
  }

  // 1. Local US data first: no network, cannot be rate-limited, always available.
  const local = usgeo.resolveLocal(q);
  if (local.length > 0) {
    return res.status(200).json({ predictions: local });
  }

  // 2. Canada hint: never let Census answer a Canadian query with a US city.
  if (looksCanadian(q)) {
    const ca = await nominatimLookup(q, 'ca');
    if (ca.predictions.length > 0) {
      return res.status(200).json({ predictions: ca.predictions });
    }
    // Only a hint, not a guarantee (a US street can be named "Canada Rd"), so an
    // empty Canadian result falls through to the normal US-first path below.
  }

  // 3. Census for street addresses.
  const census = await censusLookup(q);
  if (census && census.length > 0) {
    return res.status(200).json({ predictions: census });
  }

  // 4. Anything left over: throttled, de-duplicated, correctly-cached OSM.
  const place = await nominatimLookup(q, 'us,ca');
  return res.status(200).json({ predictions: place.predictions });
};
