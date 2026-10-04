/**
 * Minimal Emailit sender (same API and payload as fresh-web's src/lib/email/emailit.ts).
 * All PRNM email goes through Emailit from noreply@poolrentalnearme.com (CLAUDE.md rule 5).
 * Requires EMAILIT_API_KEY in the environment; throws with .status on failure.
 */
const EMAILIT_ENDPOINT = 'https://api.emailit.com/v2/emails';
const FROM_NOREPLY = 'Pool Rental Near Me <noreply@poolrentalnearme.com>';

const sendViaEmailit = async ({ from = FROM_NOREPLY, to, subject, html, text, replyTo }) => {
  const apiKey = process.env.EMAILIT_API_KEY;
  if (!apiKey) {
    const e = new Error('EMAILIT_API_KEY is not configured');
    e.status = 500;
    throw e;
  }
  const body = { from, to, subject, html };
  if (text) body.text = text;
  if (replyTo) body.reply_to = replyTo;
  const res = await fetch(EMAILIT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    const e = new Error(`Emailit ${res.status}: ${raw.slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // tolerate an empty body
  }
  return { id: parsed.id || '' };
};

module.exports = { sendViaEmailit, FROM_NOREPLY };
