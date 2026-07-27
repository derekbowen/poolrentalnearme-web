// Admin CLI for the Derek/Brandon reply round-robin. Run inside the prod
// container (it needs SUPABASE_* env):
//
//   docker exec poolrentalnearme-production node server/extensions/sms-messaging/mod/notify/routectl.js status
//   docker exec poolrentalnearme-production node server/extensions/sms-messaging/mod/notify/routectl.js assign +15551234567 brandon
//   docker exec poolrentalnearme-production node server/extensions/sms-messaging/mod/notify/routectl.js brandon +15559876543
//   docker exec poolrentalnearme-production node server/extensions/sms-messaging/mod/notify/routectl.js brandon off
//
// Changes take effect on the live webhook within ~60s (its in-process caches).
const fs = require('fs');
const path = require('path');
const { rest, logRoute } = require('./routing');

const FOREVER = '2099-01-01T00:00:00Z';
const enc = encodeURIComponent;

let CONTACTS = {};
try {
  CONTACTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'campaign-contacts.json'), 'utf8'));
} catch (e) {
  CONTACTS = {};
}

const die = msg => {
  console.error(msg);
  process.exit(1);
};

const status = async () => {
  const cfgRows = await (await rest('sms_reply_ctx?kind=eq.route_config&select=pool,tx_id')).json();
  const cfg = {};
  for (const r of cfgRows) cfg[r.pool] = r.tx_id;
  console.log('config:');
  console.log(`  brandon_number : ${cfg.brandon_number || '(unset)'}${(cfg.brandon_number || '').startsWith('+') ? '  [ROUND-ROBIN ACTIVE]' : '  [ALL NEW -> DEREK]'}`);
  console.log(`  next_assignee  : ${cfg.next_assignee || 'derek'}`);
  const rows = await (
    await rest('sms_reply_ctx?kind=eq.route_assign&select=phone,tx_id,when_label,created_at&order=created_at.asc&limit=1000')
  ).json();
  const counts = { derek: 0, brandon: 0 };
  console.log(`assignments (${rows.length}):`);
  for (const r of rows) {
    counts[r.tx_id] = (counts[r.tx_id] || 0) + 1;
    console.log(`  ${r.phone}  -> ${r.tx_id.toUpperCase().padEnd(7)} (${r.when_label || '?'}, ${r.created_at.slice(0, 16)})  ${CONTACTS[r.phone] || ''}`);
  }
  console.log(`totals: DEREK ${counts.derek || 0} · BRANDON ${counts.brandon || 0}`);
};

const assign = async (phone, who) => {
  if (!/^\+\d{10,15}$/.test(phone)) die(`bad phone: ${phone} (want E.164, e.g. +15551234567)`);
  if (who !== 'derek' && who !== 'brandon') die(`bad assignee: ${who} (want derek|brandon)`);
  await rest(`sms_reply_ctx?kind=eq.route_assign&phone=eq.${enc(phone)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
  await rest('sms_reply_ctx', {
    method: 'POST',
    body: [{ phone, tx_id: who, kind: 'route_assign', when_label: 'manual', expires_at: FOREVER }],
    prefer: 'return=minimal',
  });
  await logRoute(phone, 'reassigned', `route|${who}|manual`);
  console.log(`${phone} (${CONTACTS[phone] || 'unknown'}) -> ${who.toUpperCase()}  (live within ~60s)`);
};

const setBrandon = async value => {
  const v = value === 'off' ? 'off' : value;
  if (v !== 'off' && !/^\+\d{10,15}$/.test(v)) die(`bad value: ${value} (want +1XXXXXXXXXX or off)`);
  const patched = await rest(`sms_reply_ctx?kind=eq.route_config&pool=eq.brandon_number`, {
    method: 'PATCH',
    body: { tx_id: v },
    prefer: 'return=representation',
  });
  if (!(await patched.json()).length) {
    await rest('sms_reply_ctx', {
      method: 'POST',
      body: [{ phone: 'config', tx_id: v, kind: 'route_config', pool: 'brandon_number', expires_at: FOREVER }],
      prefer: 'return=minimal',
    });
  }
  await logRoute('config', 'config', `route|brandon_number|${v}`);
  console.log(v === 'off' ? 'Brandon OFF — all new conversations -> DEREK (existing assignments kept, live ~30s)' : `Brandon number set: ${v} — round-robin ACTIVE (live ~30s)`);
};

(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'status') return status();
  if (cmd === 'assign') return assign(a, b);
  if (cmd === 'brandon') return setBrandon(a);
  die('usage: routectl.js status | assign <phone> <derek|brandon> | brandon <+1XXXXXXXXXX|off>');
})().catch(e => die(`error: ${e.message}`));
