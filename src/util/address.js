/**
 * Address privacy helpers.
 *
 * A host's exact street address must never appear on a public listing page. Guests
 * browsing the site see the city/state only; the full address belongs in the
 * listing's privateData and is shared with a guest after the host accepts.
 *
 * Two entry points:
 *   splitAddressForPrivacy - used when SAVING a listing, so nothing sensitive is
 *                            written to publicData in the first place.
 *   stripStreetAddress     - used when RENDERING, as a backstop for any listing
 *                            whose publicData still carries a street address.
 */

// "3005 Appaloosa St", "108 Hilltop Dr", "390 Cedar Hill Rd", "1234 Foo Apt 2"
// Includes non-US street types: an Australian address is "2 Gal Cres, Moorebank
// NSW 2170, Australia", and a listing whose street type we do not recognise is a
// listing whose street we will happily print.
const STREET_TYPES =
  'st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place|' +
  'cir|circle|ter|terrace|trail|trl|hwy|highway|pkwy|parkway|loop|run|path|row|walk|' +
  'cv|cove|bnd|bend|xing|crossing|sq|square|aly|alley|expy|expressway|' +
  'cres|crescent|cl|close|gr|grove|esp|esplanade|pde|parade|gdns|gardens|mews|quay|' +
  'rise|vale|view|wynd|brae|hts|heights|plz|plaza|cyn|canyon|rdg|ridge|holw|hollow';

const STREET_RE = new RegExp(`\\d{1,6}\\s+[\\w.'-]+(\\s+[\\w.'-]+)*\\s+(${STREET_TYPES})\\b\\.?`, 'i');
const LEADING_NUMBER_RE = /^\s*\d{1,6}[\w-]*\s+\S/;

// A street line does not need a house number. "Nicholas Dr, Carlisle, PA" and
// "Catherine St, Union, NJ" were both published verbatim because the two rules
// above only fire on a leading number.
//
// This list is DELIBERATELY NARROWER than STREET_TYPES. Without a house number
// the only signal is the suffix, and many suffixes are ordinary city names:
// Elk Grove, Mountain View, Garden Grove, Morgan Hill, Cedar Rapids. Matching
// those would blank out the location on real listings. Every type kept here is
// one that effectively never ends a city name; the rest still match when a
// house number is present, where there is no ambiguity.
// "terrace" is excluded for the same reason: Grand Terrace, CA is a city.
const BARE_STREET_TYPES =
  'st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|blvd|boulevard|' +
  'cres|crescent|pkwy|parkway|hwy|highway|cir|circle|' +
  'pde|parade|esplanade|expy|expressway|aly|alley';

const STREET_SUFFIX_RE = new RegExp(
  `(^|\\s)[\\w.'-]+\\s+(${BARE_STREET_TYPES})\\b\\.?\\s*$`,
  'i'
);

// A bare number is a house number or a postcode fragment, never a locality.
// Real malformed data: "11914, Park Creek Drive" resolved to "11914".
const BARE_NUMBER_RE = /^\s*\d[\d\s-]*\s*$/;

/**
 * True when the string looks like it contains a specific street address.
 *
 * @param {string} address
 * @returns {boolean}
 */
export const hasStreetAddress = address => {
  const a = String(address || '');
  return STREET_RE.test(a) || LEADING_NUMBER_RE.test(a) || STREET_SUFFIX_RE.test(a);
};

/**
 * Public-safe label for a location: city/state/zip, never a house number.
 *
 * Prefers the structured city/state/zip fields when present. Falls back to
 * dropping the first comma-separated segment, which is the street line in the
 * Google Places format ("3005 Appaloosa St, Norco, CA 92860, USA").
 *
 * @param {string} address full address as entered
 * @param {Object} [parts] optional { city, state, zip } from the place result
 * @returns {string} a label safe to show publicly
 */
export const publicAddressLabel = (address, parts = {}) => {
  const { city, state, zip } = parts || {};
  const structured = [city, state, zip].filter(Boolean).join(', ');
  if (structured && !hasStreetAddress(structured)) {
    return structured;
  }

  const segments = String(address || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !/^usa$/i.test(s));

  // Only drop the leading segment when it is actually a street line.
  const withoutStreet =
    segments.length > 1 && hasStreetAddress(segments[0]) ? segments.slice(1) : segments;

  const label = withoutStreet.join(', ');
  return hasStreetAddress(label) ? city || '' : label;
};

/**
 * Render-time backstop. Returns the address unchanged when it carries no street
 * detail, otherwise reduces it to a public-safe label.
 *
 * @param {string} address
 * @returns {string}
 */
export const stripStreetAddress = address =>
  hasStreetAddress(address) ? publicAddressLabel(address) : String(address || '');

/**
 * City and state for a listing, for SEO titles and headings.
 *
 * Reads the structured fields when present. Falls back to parsing the label,
 * which works whether or not a street line is still attached - so this stays
 * correct for both legacy ("3005 Appaloosa St, Norco, CA 92860") and current
 * ("Norco, CA, 92860") shapes.
 *
 * @param {Object} location publicData.location
 * @returns {{city: string, state: string}}
 */
export const cityStateFromLocation = (location = {}) => {
  const { city, state, address } = location || {};
  if (city && state) {
    return { city, state };
  }

  const segments = String(address || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !/^usa$/i.test(s));
  // Drop the street line if it is still present, leaving [city, state(+zip), ...]
  const parts = segments.length > 1 && hasStreetAddress(segments[0]) ? segments.slice(1) : segments;

  return {
    city: city || parts[0] || '',
    // "CA 92860" -> "CA"; a bare zip segment is not a state
    state: state || (parts[1] || '').split(' ').filter(t => /^[A-Za-z]{2,}$/.test(t))[0] || '',
  };
};

const COUNTRY_RE = /^(usa|u\.?s\.?a?\.?|united states( of america)?|australia|canada|uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|ireland|new zealand)$/i;

// Trailing postcodes: US "92336"/"92336-1234", AU/NZ "2170", UK "SW1A 2AA".
const POSTCODE_RE = /^(\d{4,5}(-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i;
// A region token in a "Locality REGION postcode" segment: "NSW", "CA", "Michigan".
const REGION_TOKEN_RE = /^[A-Za-z]{2,}$/;

/**
 * Pull a locality (and region, when the segment carries one) out of one
 * comma-separated segment. "Moorebank NSW 2170" -> { locality: 'Moorebank',
 * region: 'NSW' }. Returns null for anything street-shaped or numeric.
 */
const localityFromSegment = segment => {
  const words = String(segment || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  // Strip a trailing postcode ("SW1A 2AA" is two words, so try two then one).
  let rest = words;
  const lastTwo = rest.slice(-2).join(' ');
  if (rest.length > 2 && POSTCODE_RE.test(lastTwo)) {
    rest = rest.slice(0, -2);
  } else if (rest.length > 1 && POSTCODE_RE.test(rest[rest.length - 1])) {
    rest = rest.slice(0, -1);
  }
  if (!rest.length) return null;

  // With a postcode stripped, a trailing word is the region: "Moorebank NSW".
  let region = '';
  if (rest.length > 1 && rest.length !== words.length && REGION_TOKEN_RE.test(rest[rest.length - 1])) {
    region = rest[rest.length - 1];
    rest = rest.slice(0, -1);
  }

  const locality = rest.join(' ').trim();
  if (!locality || BARE_NUMBER_RE.test(locality) || hasStreetAddress(locality)) return null;
  return { locality, region };
};

/**
 * A region from the segment that follows the locality: "TX 78701" -> "TX",
 * "NM" -> "NM". Returns '' for anything that is not plainly a region name, so
 * a stray segment can never be appended to the label.
 */
const regionFromSegment = segment => {
  const words = String(segment || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const rest = POSTCODE_RE.test(words[words.length - 1]) ? words.slice(0, -1) : words;
  if (!rest.length || rest.length > 2) return '';
  const region = rest.join(' ');
  return REGION_TOKEN_RE.test(rest[0]) && !hasStreetAddress(region) ? region : '';
};

/**
 * The public location label for a listing card or any other guest-facing
 * surface: city-level detail, never a street.
 *
 * Structured `location.city` / `location.state` win outright. Only when those
 * are absent is the address string consulted, and then every candidate segment
 * is VALIDATED rather than trusted by position - the old
 * `addressArray[length - 3]` returned the city for a four-part US address and
 * the street for a three-part international one ("2 Gal Cres, Moorebank NSW
 * 2170, Australia" -> "2 Gal Cres").
 *
 * When no locality can be established the label degrades to the region, then
 * the country, then the empty string. A blank location is a fine thing to
 * render; a host's street is not.
 *
 * @param {Object} location publicData.location
 * @returns {string} safe to display publicly
 */
export const publicLocationLabel = (location = {}) => {
  const loc = location || {};
  const clean = v => {
    const s = String(v == null ? '' : v).trim();
    return s && !BARE_NUMBER_RE.test(s) && !hasStreetAddress(s) ? s : '';
  };

  const city = clean(loc.city);
  const state = clean(loc.state);
  if (city && state) return `${city}, ${state}`;
  if (city) return city;

  const segments = String(loc.address || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const country = segments.find(s => COUNTRY_RE.test(s)) || '';
  const candidates = segments.filter(s => !COUNTRY_RE.test(s));

  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = localityFromSegment(candidates[i]);
    if (!parsed) continue;
    // The region may live inside the locality's own segment ("Moorebank NSW
    // 2170") or in the segment after it ("Austin", "TX 78701").
    const region = state || parsed.region || regionFromSegment(candidates[i + 1]);
    return region ? `${parsed.locality}, ${region}` : parsed.locality;
  }

  return state || country || '';
};

/**
 * Split a place into the public label and the exact address to keep private.
 *
 * @param {string} address full address from the place result
 * @param {Object} [parts] optional { city, state, zip }
 * @returns {{publicLabel: string, exactAddress: string}}
 */
export const splitAddressForPrivacy = (address, parts = {}) => ({
  publicLabel: publicAddressLabel(address, parts),
  exactAddress: String(address || ''),
});
