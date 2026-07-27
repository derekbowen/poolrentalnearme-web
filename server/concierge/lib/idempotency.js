// MessageSid dedup -- Twilio retries webhooks; a retry must never double-process.
// Primary store: message_receipts (message_sid UNIQUE). Until that table exists we
// fall back to the EXISTING sms_log.twilio_sid (reuse, don't rebuild).
'use strict';
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };

async function seenInSmsLog(sid) {
  const r = await fetch(U + `/rest/v1/sms_log?twilio_sid=eq.${encodeURIComponent(sid)}&select=id&limit=1`, { headers: H });
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

// true = first time we've seen this sid (process it); false = duplicate (skip).
async function claim(messageSid, meta = {}) {
  if (!messageSid) return true;
  // try the dedicated table first
  const r = await fetch(U + '/rest/v1/message_receipts', {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify([{ message_sid: messageSid, direction: meta.direction || 'inbound', note: meta.note || null }]),
  });
  if (r.status === 201) return true;   // inserted -> first time
  if (r.status === 409) return false;  // unique violation -> duplicate
  // table missing / other -> fall back to sms_log
  return !(await seenInSmsLog(messageSid));
}
module.exports = { claim };
