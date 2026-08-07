const { getSdk } = require('../api-util/sdk');

// c153: owner-gated click counts for the host's tracked share link.
module.exports = async (req, res) => {
  const listingId = req.query && req.query.listingId;
  if (!listingId) return res.status(400).json({ error: 'listingId is required' });
  try {
    await getSdk(req, res).ownListings.show({ id: listingId });
  } catch (e) {
    return res.status(403).json({ error: 'Only the pool owner can view link stats.' });
  }
  const U = process.env.SUPABASE_URL;
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!U || !K) return res.status(200).json({ total: 0, last7: 0 });
  const H = { apikey: K, Authorization: 'Bearer ' + K, Prefer: 'count=exact' };
  const count = async extra => {
    const r = await fetch(
      `${U}/rest/v1/sms_reply_ctx?kind=eq.share_click&tx_id=eq.${encodeURIComponent(
        listingId
      )}${extra}&select=id&limit=1`,
      { headers: H }
    );
    const m = (r.headers.get('content-range') || '').match(/\/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  try {
    const [total, last7] = await Promise.all([count(''), count(`&created_at=gte.${since}`)]);
    return res.status(200).json({ total, last7 });
  } catch (e) {
    return res.status(200).json({ total: 0, last7: 0 });
  }
};
