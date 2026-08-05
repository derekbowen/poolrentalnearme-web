/**
 * Lead capture endpoint.
 *
 * Persists visitor email submissions (plus the surrounding context: IP-
 * geolocation, nearest listing distance, current user if authenticated,
 * etc.) to a simple append-only JSONL file. This keeps everything — email,
 * user data, geo — in sync on the server so it can later be flushed to a
 * CRM, data warehouse, or mailing list.
 *
 * Storage is intentionally file-based so this works out of the box with no
 * extra infrastructure. Swap `writeLead` for a DB / Intercom / Supabase call
 * when ready — the shape of the record is stable.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ensureDataDir = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('[lead-capture] Failed to create data dir:', e);
  }
};

// ── Abuse protection ──────────────────────────────────────────────────────
// This endpoint is intentionally public (anonymous visitors submit emails),
// so it gets a per-IP sliding-window rate limit and a hard cap on the leads
// file size. Without these, a loop of valid-looking emails could fill the
// disk and poison the CRM export.
const LEADS_PER_IP_PER_HOUR = 5;
const LEADS_FILE_MAX_BYTES = 25 * 1024 * 1024; // 25MB ≈ hundreds of thousands of leads
const leadHits = new Map(); // ip -> [timestamps]
const allowLead = (ip) => {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const hits = (leadHits.get(ip) || []).filter((t) => t > cutoff);
  if (hits.length >= LEADS_PER_IP_PER_HOUR) return false;
  hits.push(now);
  leadHits.set(ip, hits);
  if (leadHits.size > 10000) {
    for (const [k, v] of leadHits) if (!v.some((t) => t > cutoff)) leadHits.delete(k);
  }
  return true;
};
const leadsFileFull = () => {
  try {
    return fs.existsSync(LEADS_FILE) && fs.statSync(LEADS_FILE).size > LEADS_FILE_MAX_BYTES;
  } catch {
    return false;
  }
};

const writeLead = (record) =>
  new Promise((resolve, reject) => {
    ensureDataDir();
    fs.appendFile(LEADS_FILE, JSON.stringify(record) + '\n', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

const sanitizeLocation = (loc) => {
  if (!loc || typeof loc !== 'object') return null;
  const { lat, lng, city, region, country } = loc;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return {
    lat,
    lng,
    city: typeof city === 'string' ? city : null,
    region: typeof region === 'string' ? region : null,
    country: typeof country === 'string' ? country : null,
  };
};

const sanitizePools = (pools) => {
  if (!Array.isArray(pools)) return [];
  return pools.slice(0, 10).map((p) => ({
    id: typeof p?.id === 'string' ? p.id : null,
    name: typeof p?.name === 'string' ? p.name.slice(0, 200) : null,
    distanceMiles:
      typeof p?.distanceMiles === 'number' ? p.distanceMiles : null,
  }));
};

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!email || !EMAIL_RE.test(email) || email.length > 320) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!allowLead(ip)) {
      // Rate-limited clients get a success-shaped response: a lead form
      // should never teach a scraper the limiter's shape, and a real human
      // double-submitting still sees the thank-you state.
      return res.status(200).json({ ok: true });
    }
    if (leadsFileFull()) {
      console.error('[lead-capture] leads file exceeds size cap; dropping lead');
      return res.status(200).json({ ok: true });
    }

    const record = {
      email,
      source: 'landing_page_far_away_capture',
      nearestDistanceMiles:
        typeof body.nearestDistanceMiles === 'number'
          ? body.nearestDistanceMiles
          : null,
      location: sanitizeLocation(body.location),
      pools: sanitizePools(body.pools),
      referrer:
        typeof body.referrer === 'string' ? body.referrer.slice(0, 500) : null,
      pathname:
        typeof body.pathname === 'string' ? body.pathname.slice(0, 500) : null,
      // Server-observed fields
      ip:
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        null,
      userAgent: req.headers['user-agent'] || null,
      receivedAt: new Date().toISOString(),
    };

    await writeLead(record);

    // Also log so operators can see captures in server logs immediately.
    console.log(
      `[lead-capture] ${record.email} from ${record.location?.city || 'unknown'} ` +
        `(nearest ${record.nearestDistanceMiles ?? '??'} mi)`
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[lead-capture] Error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
};
