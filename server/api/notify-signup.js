/**
 * Lead capture for the "Get notified when we add more pools" banner on /s.
 * MVP: logs the lead so it's retrievable via `docker logs <container> | grep NOTIFY_LEAD`.
 * (Can be upgraded to a durable store / email when there's volume.)
 * JSON body: { email, location }.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = (req, res) => {
  try {
    const { email, location, source } = req.body || {};
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const loc = typeof location === 'string' ? location.slice(0, 160) : '';
    const src = typeof source === 'string' ? source.slice(0, 40) : 'search';
    // eslint-disable-next-line no-console
    console.log(
      'NOTIFY_LEAD ' +
        JSON.stringify({ email: email.trim().slice(0, 254), location: loc, source: src, at: new Date().toISOString() })
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed' });
  }
};
