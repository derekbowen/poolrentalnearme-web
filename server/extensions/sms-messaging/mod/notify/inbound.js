// Twilio inbound-SMS webhook. Handles compliance keywords (STOP/START/HELP),
// reply-to-accept ("1"/"2"/"YES"), and FORWARDS any genuine reply to whoever
// owns that host's thread (Derek or Brandon — round-robin on NEW conversations
// with permanent thread stickiness; see ./routing.js). Mounted at
// POST /api/sms/inbound.
//
// SECURITY: this endpoint can trigger operator-accept/decline (real Stripe
// capture/refund) via reply-to-accept, so every request MUST carry a valid
// X-Twilio-Signature. Without it, anyone could forge a "From" and force-accept
// bookings. We fail CLOSED (403) on a missing/invalid signature.
const bodyParser = require('body-parser');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const store = require('./supastore');
const { handleReply } = require('./replyactions');
const twsend = require('./twsend');
const routing = require('./routing');

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const INBOUND_URL = process.env.TWILIO_INBOUND_URL || 'https://www.poolrentalnearme.com/api/sms/inbound';
const VALIDATE = process.env.TWILIO_VALIDATE_SIGNATURE !== 'false';

// Fallback reply-forwarding target (Derek). Per-thread ownership (Derek vs
// Brandon) is resolved by ./routing.js; this only backstops a routing failure.
const FORWARD_TO = process.env.CAMPAIGN_FORWARD_TO || '+19092728096';
// phone -> display name for labeling forwards. Best-effort; missing => 'unknown'.
let CONTACTS = {};
try {
  CONTACTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'campaign-contacts.json'), 'utf8'));
} catch (e) {
  CONTACTS = {};
}
const contactName = from => CONTACTS[from] || 'unknown';
// Flood cap: forward up to FLOOD_MAX msgs per number per window, then one "…more" note.
const FLOOD_MAX = 5;
const FLOOD_WINDOW_MS = 30 * 60 * 1000;
const fwd = new Map(); // from -> { count, windowStart, notified }

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const START_WORDS = ['START', 'UNSTOP', 'YES'];
const HELP_WORDS = ['HELP', 'INFO'];

const twiml = msg =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`;

const verifyTwilioSignature = (req, res, next) => {
  if (!VALIDATE) return next();
  const sig = req.get('X-Twilio-Signature');
  const ok = !!AUTH_TOKEN && !!sig && twilio.validateRequest(AUTH_TOKEN, sig, INBOUND_URL, req.body || {});
  if (!ok) {
    console.warn('[sms-inbound] REJECTED unsigned/invalid request', { hasSig: !!sig, ip: req.ip });
    res.set('Content-Type', 'text/xml');
    return res.status(403).send(twiml(''));
  }
  return next();
};

// Forward a genuine (non-command) reply to the host's assigned queue owner
// (Derek or Brandon) + log it. Never throws; routing falls back to Derek.
// mediaUrls: Twilio-hosted MMS media from the sender — forwarded as real MMS so
// a photo-only message (empty Body) is never dropped again (Rosaria sent 8 pool
// photos on 2026-07-28 and they sat unseen for 19 days).
const forwardReply = async (from, raw, mediaUrls = []) => {
  try {
    const note = mediaUrls.length ? `[${mediaUrls.length} photo${mediaUrls.length > 1 ? 's' : ''}] ` : '';
    await store.logInboundReply({ phone: from, token: (note + raw).slice(0, 300), status: 'campaign_reply' });
  } catch (e) {
    /* audit best-effort */
  }
  try {
    const now = Date.now();
    let fc = fwd.get(from);
    if (!fc || now - fc.windowStart > FLOOD_WINDOW_MS) {
      fc = { count: 0, windowStart: now, notified: false };
      fwd.set(from, fc);
    }
    fc.count++;
    const name = contactName(from);
    let target = { assignee: 'derek', to: FORWARD_TO, label: 'DEREK' };
    try {
      target = await routing.resolveTarget(from);
    } catch (e) {
      /* resolveTarget never throws, but if it ever did: Derek */
    }
    if (fc.count <= FLOOD_MAX) {
      const note = mediaUrls.length ? ` [${mediaUrls.length} photo${mediaUrls.length > 1 ? 's' : ''} attached]` : '';
      await twsend({
        phoneNumber: target.to,
        body: `PRNM reply [${target.label}] — ${name} ${from}:${note} ${raw.slice(0, 400)}`,
        mediaUrls,
      });
    } else if (!fc.notified) {
      fc.notified = true;
      await twsend({ phoneNumber: target.to, body: `PRNM reply [${target.label}] — …more from ${name} ${from} (further replies this window suppressed)` });
    }
  } catch (e) {
    console.error('[sms-inbound] forward error', e.message);
  }
};

const handler = async (req, res) => {
  const from = (req.body?.From || '').trim();
  const raw = (req.body?.Body || '').trim();
  // MMS: Twilio posts NumMedia + MediaUrl0..N. A photo-only message has an
  // empty Body, so media must count as content or the message vanishes.
  const numMedia = parseInt(req.body?.NumMedia || '0', 10) || 0;
  const mediaUrls = [];
  for (let i = 0; i < numMedia && i < 10; i++) {
    const u = req.body?.[`MediaUrl${i}`];
    if (u) mediaUrls.push(u);
  }
  const word = raw.toUpperCase().replace(/[^A-Z]/g, ''); // STOP/START/HELP/YES
  const digit = raw.replace(/[^0-9]/g, ''); // "1" accept / "2" decline
  res.set('Content-Type', 'text/xml');
  try {
    // 1) Opt-out always wins.
    if (from && STOP_WORDS.includes(word)) {
      await store.setOptOut(from, true);
      return res.send(twiml('You are unsubscribed from Pool Rental Near Me texts. Reply START to resubscribe.'));
    }
    // 2) Reply-to-accept: "1"/"2" always, "YES" only if a decline is armed.
    if (from) {
      const token = digit === '1' || digit === '2' ? digit : word === 'YES' ? 'YES' : null;
      if (token) {
        const reply = await handleReply(from, token);
        if (reply != null) {
          return res.send(twiml(reply));
        }
      }
    }
    if (from && START_WORDS.includes(word)) {
      await store.setOptOut(from, false);
      return res.send(twiml('You are resubscribed to Pool Rental Near Me booking alerts. Reply STOP to opt out.'));
    }
    if (HELP_WORDS.includes(word)) {
      return res.send(twiml('Pool Rental Near Me booking & account alerts. Msg & data rates may apply. Reply STOP to opt out. Help: support@poolrentalnearme.com'));
    }
  } catch (e) {
    console.error('[sms-inbound] error', e.message);
  }
  // Non-command inbound = a genuine reply → forward to Derek + log. (STOP/START/
  // HELP/1/2/YES already returned above and are NOT forwarded.) Media counts as
  // content: a photo-only MMS must forward, not vanish.
  if (from && (raw || mediaUrls.length)) {
    await forwardReply(from, raw, mediaUrls);
  }
  return res.send(twiml(''));
};

const inboundRoute = [bodyParser.urlencoded({ extended: false }), verifyTwilioSignature, handler];

module.exports = { inboundRoute, handler, verifyTwilioSignature };
