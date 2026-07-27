// Per-listing iCal feed token: HMAC-SHA256(listingId:version, ICAL_FEED_SECRET).
// Unguessable, revocable (bump version), constant-time verified. No secret in the URL.
const crypto = require('crypto');

const SECRET = process.env.ICAL_FEED_SECRET || '';

// Default version when a listing has never rotated its link.
const DEFAULT_VERSION = 1;

function sign(listingId, version = DEFAULT_VERSION) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${listingId}:${version}`)
    .digest('hex');
}

// Constant-time compare; false on any length/format mismatch.
function verify(listingId, version, token) {
  if (!SECRET || !token || typeof token !== 'string') return false;
  const expected = sign(listingId, version);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const configured = () => !!SECRET;

module.exports = { sign, verify, configured, DEFAULT_VERSION };
