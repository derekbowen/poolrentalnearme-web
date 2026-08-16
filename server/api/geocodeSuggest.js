// c133: same-origin geocoding proxy backed by the US Census Bureau geocoder.
// Added because the Google Maps key has billing disabled (REQUEST_DENIED on every
// lookup), which hard-blocked the listing wizard's address step for all new hosts.
// Census is keyless, free, public-domain and US-only — which matches the marketplace.
// Swap the upstream here (single place) when a paid geocoding provider is enabled.
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

// c149: Census only matches STREET addresses — city/zip queries ("Modesto, CA")
// returned zero predictions, which silently broke the search bar marketplace-wide
// since c133 (search fell back to an unfiltered national list). Nominatim (OSM)
// handles place queries; used only as fallback when Census finds nothing, with a
// 24h in-memory cache to keep request volume within OSM usage policy.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_UA = 'PoolRentalNearMe/1.0 (support@poolrentalnearme.com)';
const placeCache = new Map(); // cacheKey -> { at, predictions }
const PLACE_TTL_MS = 24 * 3600 * 1000;

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

const shortPlaceName = display => {
  // "Modesto, Stanislaus County, California, United States" -> "Modesto, California"
  // "Ancaster, ..., Ontario, L9G 2B9, Canada"              -> "Ancaster, Ontario"
  const parts = String(display || '').split(',').map(p => p.trim())
    .filter(p => p && !/county$/i.test(p) && p !== 'United States' && p !== 'Canada' && !CA_POSTAL.test(p));
  if (parts.length <= 2) return parts.join(', ');
  return [parts[0], parts[parts.length - 1]].join(', ');
};

// Nominatim addressdetails give a clean street line; the flat display_name for a
// Canadian address is a 8-part chain of neighbourhoods nobody can read.
const addressLine = row => {
  const a = row && row.address;
  if (!a) return null;
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const city = a.city || a.town || a.village || a.hamlet || a.suburb;
  const region = a.state || a.province;
  const line = [street || null, city || null, [region, a.postcode].filter(Boolean).join(' ') || null]
    .filter(Boolean).join(', ');
  return street && line ? line : null;
};

const nominatimFallback = async (q, countryCodes = 'us') => {
  const key = countryCodes + '|' + q.toLowerCase();
  const hit = placeCache.get(key);
  if (hit && Date.now() - hit.at < PLACE_TTL_MS) return hit.predictions;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const url = NOMINATIM_URL + '?format=jsonv2&addressdetails=1&limit=5&countrycodes=' +
      encodeURIComponent(countryCodes) + '&q=' + encodeURIComponent(q);
    const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': NOMINATIM_UA } });
    const rows = await r.json();
    const predictions = (Array.isArray(rows) ? rows : []).map(row => {
      const street = addressLine(row);
      const p = {
        id: 'osm.' + row.place_id,
        place_name: street || shortPlaceName(row.display_name),
        center: [parseFloat(row.lon), parseFloat(row.lat)],
        place_type: [street ? 'address' : 'place'],
      };
      const bb = row.boundingbox; // [south, north, west, east] as strings
      if (Array.isArray(bb) && bb.length === 4) {
        p.bbox = [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])];
      }
      return p;
    }).filter(p => Number.isFinite(p.center[0]) && Number.isFinite(p.center[1]));
    placeCache.set(key, { at: Date.now(), predictions });
    return predictions;
  } finally {
    clearTimeout(timer);
  }
};

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

module.exports = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 4) {
    return res.status(200).json({ predictions: [] });
  }
  if (looksCanadian(q)) {
    // Census would answer with a same-named US city; never let it near this query.
    const caPredictions = await nominatimFallback(q, 'ca').catch(() => []);
    // Only a hint, not a guarantee (a US street can be named "Canada Rd"), so an
    // empty Canadian result falls through to the normal US-first path below.
    if (caPredictions.length > 0) {
      return res.status(200).json({ predictions: caPredictions });
    }
  }
  try {
    const url =
      CENSUS_URL +
      '?address=' +
      encodeURIComponent(q) +
      '&benchmark=Public_AR_Current&format=json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await r.json();
    const matches = (data && data.result && data.result.addressMatches) || [];
    const predictions = matches.slice(0, 5).map(m => ({
      id: 'census.' + String(m.matchedAddress || '').replace(/[^A-Za-z0-9]+/g, '-'),
      place_name: formatAddress(m.matchedAddress),
      center: [m.coordinates.x, m.coordinates.y],
      place_type: ['address'],
    }));
    if (predictions.length === 0) {
      // No street match: treat as a city/zip/place query.
      const placePredictions = await nominatimFallback(q, 'us,ca').catch(() => []);
      return res.status(200).json({ predictions: placePredictions });
    }
    return res.status(200).json({ predictions });
  } catch (e) {
    // Census upstream hiccup: still try the place fallback before giving up.
    const placePredictions = await nominatimFallback(q).catch(() => []);
    return res.status(200).json({ predictions: placePredictions });
  }
};
