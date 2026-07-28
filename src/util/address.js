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
const STREET_TYPES =
  'st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard|way|pl|place|' +
  'cir|circle|ter|terrace|trail|trl|hwy|highway|pkwy|parkway|loop|run|path|row|walk|' +
  'cv|cove|bnd|bend|xing|crossing|sq|square|aly|alley|expy|expressway';

const STREET_RE = new RegExp(`\\d{1,6}\\s+[\\w.'-]+(\\s+[\\w.'-]+)*\\s+(${STREET_TYPES})\\b\\.?`, 'i');
const LEADING_NUMBER_RE = /^\s*\d{1,6}[\w-]*\s+\S/;

/**
 * True when the string looks like it contains a specific street address.
 *
 * @param {string} address
 * @returns {boolean}
 */
export const hasStreetAddress = address => {
  const a = String(address || '');
  return STREET_RE.test(a) || LEADING_NUMBER_RE.test(a);
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
