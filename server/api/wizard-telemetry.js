// POST /api/wizard-telemetry  { kind, step, error }
// Fire-and-forget "air file" for listing-wizard failures: the browser beacons
// every wizard error (draft save / publish / update / image upload) here so a
// stuck host is visible in the ops air files WITHOUT contacting support.
// Rows land in Supabase sms_reply_ctx (kind='wizard_error') — the same store
// the stuck-host detector and warm digest already read. Best-effort by
// design: this endpoint never returns an error the client would care about.

const RL_WINDOW_MS = 5 * 60 * 1000;
const RL_MAX = 20; // per IP per window — a browser in a retry loop, not a flood
const rlHits = new Map();
const rateLimited = req => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const now = Date.now();
  const arr = (rlHits.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 2000) {
    for (const k of rlHits.keys()) {
      rlHits.delete(k);
      if (rlHits.size <= 1000) break;
    }
  }
  return arr.length > RL_MAX;
};

module.exports = async (req, res) => {
  try {
    if (rateLimited(req)) return res.json({ ok: true });
    const U = process.env.SUPABASE_URL;
    const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!U || !K) return res.json({ ok: true });

    let uid = '';
    try {
      // credentials:'same-origin' on the client beacon means the marketplace
      // session cookie rides along - attribute the error to its user.
      const { getSdk } = require('../api-util/sdk');
      const cu = await getSdk(req, res).currentUser.show();
      uid = (cu && cu.data && cu.data.data && cu.data.data.id && cu.data.data.id.uuid) || '';
    } catch (e) { /* anonymous or expired session - fine */ }

    const { step, error } = req.body || {};
    const stepStr = String(step || 'unknown').replace(/[^\w/.:-]/g, '').slice(0, 80);
    const errStr = String(error || '').slice(0, 240);
    const label = `WIZARD ERROR ${stepStr}: ${errStr}`;

    await fetch(`${U}/rest/v1/sms_reply_ctx`, {
      method: 'POST',
      headers: {
        apikey: K,
        Authorization: `Bearer ${K}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([
        {
          phone: 'wizard',
          pool: uid || null,
          tx_id: 'wizard',
          kind: 'wizard_error',
          pool: null,
          when_label: label,
          expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
          resolved: false,
        },
      ]),
    });
    return res.json({ ok: true });
  } catch (e) {
    // Never bubble telemetry problems to the wizard.
    return res.json({ ok: true });
  }
};
