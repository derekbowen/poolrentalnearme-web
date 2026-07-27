// Express adapter: mounts the concierge webhook as POST /api/concierge/inbound.
// Signature verification, idempotency, admin-vs-passthrough all happen inside
// handleInbound. Non-admin traffic is transparently forwarded to /api/sms/inbound.
'use strict';
const { handleInbound } = require('./lib/webhook');
const twsend = require('/home/bun/app/server/extensions/sms-messaging/mod/notify/twsend');

const send = async (phone, text) => { try { return await twsend({ body: text, phoneNumber: phone }); } catch (e) { console.error('[concierge] send err', e.message); return null; } };

async function conciergeInbound(req, res) {
  const params = req.body || {};
  const signature = req.headers['x-twilio-signature'];
  const url = process.env.CONCIERGE_INBOUND_URL || 'https://www.poolrentalnearme.com/api/concierge/inbound';
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN;
  try {
    const out = await handleInbound(params, { send, signature, url, authToken, log: (k, d) => console.log('[concierge]', k, JSON.stringify(d)) });
    res.set('Content-Type', 'text/xml');
    return res.status(out.status).send(out.twiml != null ? out.twiml : '<Response></Response>');
  } catch (e) {
    console.error('[concierge] handler err', e);
    // fail safe: never 500 Twilio into retries storms; ack empty
    res.set('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
}
module.exports = { conciergeInbound };
