// Round-robin routing for inbound host replies: Derek <-> Brandon.
// State lives in Supabase sms_reply_ctx (kind='route_assign' for per-host
// assignments, kind='route_config' for the Brandon number + alternation
// pointer), so assignments survive container restarts AND redeploys. Every
// assignment change is also logged to sms_log (event_type='sms_routing').
//
// Rules:
//   - Thread stickiness: once a host is assigned, ALL their replies keep
//     forwarding to the same person (until manually reassigned via routectl.js).
//   - NEW conversations alternate between Derek and Brandon, but ONLY while a
//     Brandon number is configured (route_config brandon_number starts with
//     '+'). While it's 'off', every new host is pinned to Derek and the
//     pointer does not advance — flipping the config on later cannot move
//     anyone already assigned.
//   - Fail-safe: ANY error here resolves to Derek. A reply is never dropped
//     or bounced because routing state was unreachable.
const DEREK = process.env.CAMPAIGN_FORWARD_TO || '+19092728096';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOREVER = '2099-01-01T00:00:00Z';
const CONFIG_TTL_MS = 30 * 1000; // brandon-number hot swap takes effect within this
const ASSIGN_TTL_MS = 60 * 1000; // routectl reassign takes effect within this

const enc = encodeURIComponent;

const rest = async (path, { method = 'GET', body, prefer } = {}) => {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`routing rest ${method} ${path.split('?')[0]} ${r.status}`);
  return r;
};

// ---- config (brandon_number, next_assignee) ------------------------------
let cfgCache = { at: 0, cfg: null };

const getConfig = async () => {
  if (cfgCache.cfg && Date.now() - cfgCache.at < CONFIG_TTL_MS) return cfgCache.cfg;
  const r = await rest('sms_reply_ctx?kind=eq.route_config&select=pool,tx_id');
  const cfg = {};
  for (const row of await r.json()) cfg[row.pool] = row.tx_id;
  cfgCache = { at: Date.now(), cfg };
  return cfg;
};

const brandonNumber = cfg =>
  typeof cfg.brandon_number === 'string' && cfg.brandon_number.startsWith('+')
    ? cfg.brandon_number
    : null;

// ---- per-host assignment --------------------------------------------------
const assignCache = new Map(); // phone -> { at, assignee }

const getAssignment = async phone => {
  const c = assignCache.get(phone);
  if (c && Date.now() - c.at < ASSIGN_TTL_MS) return c.assignee;
  const r = await rest(
    `sms_reply_ctx?kind=eq.route_assign&phone=eq.${enc(phone)}&order=created_at.desc&select=tx_id&limit=1`
  );
  const rows = await r.json();
  const assignee = rows[0]?.tx_id === 'brandon' ? 'brandon' : rows[0] ? 'derek' : null;
  if (assignee) assignCache.set(phone, { at: Date.now(), assignee });
  return assignee;
};

const logRoute = async (phone, status, detail) => {
  try {
    await rest('sms_log', {
      method: 'POST',
      body: [
        {
          event_type: 'sms_routing',
          status,
          recipient_role: 'provider',
          phone,
          body_preview: String(detail).slice(0, 120),
        },
      ],
      prefer: 'return=minimal',
    });
  } catch (e) {
    /* audit best-effort */
  }
};

const saveAssignment = async (phone, assignee, how) => {
  await rest('sms_reply_ctx', {
    method: 'POST',
    body: [{ phone, tx_id: assignee, kind: 'route_assign', when_label: how, expires_at: FOREVER }],
    prefer: 'return=minimal',
  });
  assignCache.set(phone, { at: Date.now(), assignee });
  await logRoute(phone, 'assigned', `route|${assignee}|${how}`);
};

// Flip next_assignee, but only if it still holds the value we consumed —
// losing that race means a concurrent request already advanced it, which is
// exactly what we want (never double-advance).
const advancePointer = async consumed => {
  const next = consumed === 'derek' ? 'brandon' : 'derek';
  await rest(`sms_reply_ctx?kind=eq.route_config&pool=eq.next_assignee&tx_id=eq.${consumed}`, {
    method: 'PATCH',
    body: { tx_id: next },
    prefer: 'return=minimal',
  });
  cfgCache = { at: 0, cfg: null };
};

// ---- public: resolve where a reply from `from` forwards --------------------
const DEREK_TARGET = () => ({ assignee: 'derek', to: DEREK, label: 'DEREK' });

// Serialize per-phone so two near-simultaneous first texts from the same host
// can't each claim a different assignee.
const inflight = new Map();

const resolveTarget = async from => {
  if (!from || !SUPABASE_URL || !SUPABASE_KEY) return DEREK_TARGET();
  if (inflight.has(from)) {
    try {
      await inflight.get(from);
    } catch (e) {
      /* prior attempt failed; fall through and retry */
    }
  }
  const work = (async () => {
    let assignee = await getAssignment(from);
    if (!assignee) {
      const cfg = await getConfig();
      if (!brandonNumber(cfg)) {
        assignee = 'derek';
        await saveAssignment(from, 'derek', 'auto-solo');
      } else {
        assignee = cfg.next_assignee === 'brandon' ? 'brandon' : 'derek';
        await saveAssignment(from, assignee, 'auto-rr');
        await advancePointer(assignee);
      }
    }
    if (assignee === 'brandon') {
      const bn = brandonNumber(await getConfig());
      // Assigned to Brandon but his number was switched off: deliver to Derek
      // (never drop), keep the assignment for when he's back.
      return bn ? { assignee: 'brandon', to: bn, label: 'BRANDON' } : DEREK_TARGET();
    }
    return DEREK_TARGET();
  })();
  inflight.set(from, work);
  try {
    return await work;
  } catch (e) {
    console.error('[sms-routing] resolve failed, falling back to Derek:', e.message);
    return DEREK_TARGET();
  } finally {
    inflight.delete(from);
  }
};

module.exports = { resolveTarget, getConfig, getAssignment, saveAssignment, logRoute, rest };
