// PRNM SMS Concierge — configuration. No secrets here; secrets come from env
// (already present in the prod container: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// TWILIO AUTH_TOKEN, ANTHROPIC_API_KEY).
'use strict';

// Admin phones: any inbound from these is a COMMAND, never customer flow.
// Brandon's number is filled from env when Derek provides it (BRANDON_PHONE).
const DEREK = '+19092728096';
const BRANDON = (process.env.BRANDON_PHONE || '+19099177098').trim(); // Brandon
const ADMIN_PHONES = [DEREK, BRANDON].filter(p => /^\+1\d{10}$/.test(p));

const norm = p => {
  const d = String(p || '').replace(/[^\d]/g, '');
  return d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : '+' + d;
};
const isAdmin = p => ADMIN_PHONES.includes(norm(p));
const adminName = p => (norm(p) === DEREK ? 'derek' : norm(p) === BRANDON ? 'brandon' : null);

module.exports = {
  LINE: '+18556178207',                 // the PRNM Twilio line
  DEREK, BRANDON, ADMIN_PHONES,
  norm, isAdmin, adminName,
  STOP_FILE:  process.env.CONCIERGE_STOP_FILE  || '/home/bun/app/CONCIERGE_STOP',
  PAUSE_FILE: process.env.CONCIERGE_PAUSE_FILE || '/home/bun/app/CONCIERGE_PAUSE',
  RATE_BOT_PER_HOUR: 4,                 // bot-initiated cap / thread / hour
  RATE_INTERACTIVE: 12,                 // cap when customer replied within 10 min
  INTERACTIVE_WINDOW_MIN: 10,
  RELAY_STICKY_MIN: 60,
  ESCALATION_SLA_HOURS: 2,
  SPEND_ALERT_PCT: 0.8,
  TWILIO_LOW_BALANCE: 20,
};
