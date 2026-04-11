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
