/**
 * POST /api/ceo-application — "Operating CEO for 2027" form (/operating-ceo).
 *
 * On a valid submission:
 *   1. email the full application to derek@poolrentalnearme.com (Emailit, from
 *      noreply@, reply-to = the applicant so Derek can answer directly);
 *   2. text Derek that an application arrived (Twilio, existing twsend).
 *
 * An application is never lost: if the email fails, the full application is written
 * to the server log (CEO_APPLICATION_FALLBACK) and the text says so. The applicant
 * gets {ok:true} once the application is either emailed or logged.
 * Spam: hidden honeypot field, per-IP limit, length caps. No data is stored elsewhere.
 */
const crypto = require('crypto');
const { sendViaEmailit } = require('../api-util/emailit');
const { DEREK } = require('../concierge/config');

// Loaded on use: twsend validates Twilio config at require time, and this form must
// never be able to stop the marketplace from starting.
// eslint-disable-next-line global-require
const loadTwsend = () => require('../extensions/sms-messaging/mod/notify/twsend');

const TO = 'derek@poolrentalnearme.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  location: 120,
  platforms: 200,
  listingLinks: 1000,
  hostingSince: 60,
  companies: 4000,
  why: 6000,
  plan: 6000,
  links: 500,
};
const REQUIRED = ['name', 'email', 'phone', 'location', 'why'];
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const clean = (body) => {
  const out = {};
  Object.keys(LIMITS).forEach((k) => {
    const v = body[k];
    out[k] = typeof v === 'string' ? v.trim().slice(0, LIMITS[k]) : '';
  });
  return out;
};

const validate = (a) => {
  const missing = REQUIRED.filter((k) => !a[k]);
  if (missing.length) return `Please fill in: ${missing.join(', ')}.`;
  if (!EMAIL_RE.test(a.email)) return 'Please enter a valid email address.';
  if (a.why.length < 50) return 'Please tell us a little more about why we should consider you.';
  return null;
};

const rateLimited = (ip, now) => {
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
};

const ROWS = [
  ['Name', 'name'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['City / state', 'location'],
  ['Hosts on', 'platforms'],
  ['Listing link(s)', 'listingLinks'],
  ['Hosting since', 'hostingSince'],
  ['LinkedIn / website', 'links'],
  ['Companies built or sold', 'companies'],
  ['Why we should consider them', 'why'],
  ['How they would grow PRNM in 2027', 'plan'],
];

const renderEmail = (a, ref) => {
  const rows = ROWS.filter(([, k]) => a[k]);
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">` +
    `<h2 style="margin:0 0 12px">Operating CEO application: ${esc(a.name)}</h2>${rows
      .map(
        ([label, k]) =>
          `<p style="margin:0 0 12px"><strong>${esc(label)}</strong><br>${esc(a[k]).replace(/\n/g, '<br>')}</p>`
      )
      .join(
        ''
      )}<p style="margin:16px 0 0;color:#6b7280;font-size:12px">Submitted via poolrentalnearme.com/operating-ceo · ref ${ref}. Reply to this email to answer the applicant.</p></div>`;
  const text = `Operating CEO application: ${a.name}\n\n${rows
    .map(([label, k]) => `${label}:\n${a[k]}`)
    .join('\n\n')}\n\nref ${ref}`;
  return { html, text };
};

const handler = async (req, res) => {
  const body = req.body || {};
  // Honeypot: real people never see or fill this field. Pretend success.
  if (typeof body.website2 === 'string' && body.website2.trim()) {
    return res.status(200).json({ ok: true });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '')
    .split(',')[0]
    .trim();
  if (rateLimited(ip, Date.now())) {
    return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
  }
  const a = clean(body);
  const problem = validate(a);
  if (problem) return res.status(400).json({ error: problem });

  const ref = crypto.randomBytes(4).toString('hex');
  const { html, text } = renderEmail(a, ref);
  let emailed = false;
  try {
    await sendViaEmailit({
      to: TO,
      replyTo: a.email,
      subject: `Operating CEO application: ${a.name}`,
      html,
      text,
    });
    emailed = true;
  } catch (e) {
    // Never lose an application: keep the whole thing in the server log.
    console.error(
      'CEO_APPLICATION_FALLBACK',
      JSON.stringify({ ref, at: new Date().toISOString(), ...a })
    );
    console.error('CEO_APPLICATION_EMAIL_FAILED', ref, e && e.status);
  }

  try {
    const twsend = loadTwsend();
    await twsend({
      phoneNumber: DEREK,
      body: emailed
        ? `PRNM: new Operating CEO application from ${a.name} (${a.location}). Full application emailed to ${TO}. Ref ${ref}.`
        : `PRNM: new Operating CEO application from ${a.name} (${a.location}). EMAIL FAILED - saved in server log, ref ${ref}.`,
    });
  } catch (e) {
    console.error('CEO_APPLICATION_SMS_FAILED', ref, e && (e.code || e.status));
  }

  // eslint-disable-next-line no-console
  console.log('CEO_APPLICATION', ref, emailed ? 'emailed' : 'logged');
  return res.status(200).json({ ok: true });
};

module.exports = handler;
