/**
 * POST /api/geocode  { address }  (auth-gated)
 *
 * Manual-address fallback for listing creation: when the Maps/Places script
 * fails to load in the host's browser, the client sends the typed address here
 * and we geocode it server-side with the same Google key. Keeps signup/listing
 * creation working through any client-side Maps outage.
 */
const KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

module.exports = async (req, res) => {
  try {
    const { address } = req.body || {};
    if (!address || typeof address !== 'string' || address.trim().length < 8 || address.length > 300) {
      return res.status(400).json({ error: 'Please enter a full street address.' });
    }
    if (!KEY) {
      return res.status(500).json({ error: 'Geocoding is not configured.' });
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${KEY}`;
    const r = await fetch(url);
    const body = await r.json();
    if (body.status === 'ZERO_RESULTS' || !body.results || !body.results.length) {
      return res.status(404).json({ error: "We couldn't find that address — double-check the street, city, and ZIP." });
    }
    if (body.status !== 'OK') {
      return res.status(502).json({ error: 'Address lookup is temporarily unavailable — please try again.' });
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
