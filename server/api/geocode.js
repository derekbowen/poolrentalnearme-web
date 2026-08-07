/**
 * POST /api/geocode  { address }  (auth-gated)
 *
 * Manual-address fallback for listing creation: when the Maps/Places script
 * fails to load in the host's browser, the client sends the typed address here
 * and we geocode it server-side with the same Google key. Keeps signup/listing
 * creation working through any client-side Maps outage.
 */
const KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;
// c133: US Census Bureau fallback — the Google key currently has billing disabled
// (REQUEST_DENIED on every lookup), which made this endpoint fail for every host.
// Census is keyless, free and US-only. Google is still tried first so enabling
// billing instantly restores the richer geocoder with zero code changes.
const censusLookup = async address => {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=' +
    encodeURIComponent(address) +
    '&benchmark=Public_AR_Current&format=json';
  const r = await fetch(url);
  const body = await r.json();
  const m = body && body.result && body.result.addressMatches && body.result.addressMatches[0];
  if (!m) return null;
  const parts = String(m.matchedAddress || '').toLowerCase().split(',').map(p => p.trim());
  const tc = s => s.replace(/\b([a-z])/g, (x, c) => c.toUpperCase());
  const pretty =
    parts.length >= 4
      ? tc(parts[0]) + ', ' + tc(parts[1]) + ', ' + parts[2].toUpperCase() + ' ' + parts[3]
      : tc(String(m.matchedAddress || ''));
  return { address: pretty, lat: m.coordinates.y, lng: m.coordinates.x };
};


module.exports = async (req, res) => {
  try {
    const { address } = req.body || {};
    if (!address || typeof address !== 'string' || address.trim().length < 8 || address.length > 300) {
      return res.status(400).json({ error: 'Please enter a full street address.' });
    }
    if (!KEY) {
      const viaCensus = await censusLookup(address.trim()).catch(() => null);
      if (viaCensus) return res.json(viaCensus);
      return res.status(500).json({ error: 'Geocoding is not configured.' });
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${KEY}`;
    const r = await fetch(url);
    const body = await r.json();
    if (body.status !== 'OK' || !body.results || !body.results.length) {
      const viaCensus = await censusLookup(address.trim()).catch(() => null);
      if (viaCensus) return res.json(viaCensus);
      return res.status(404).json({ error: "We couldn't find that address — double-check the street, city, and ZIP." });
    }
    const best = body.results[0];
    return res.json({
      address: best.formatted_address,
      lat: best.geometry.location.lat,
      lng: best.geometry.location.lng,
    });
  } catch (e) {
    return res.status(502).json({ error: 'Address lookup failed — please try again.' });
  }
};
