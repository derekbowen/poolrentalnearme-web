// Send via the "Pool Rental Near Me" Messaging Service when configured (gives
// Twilio Advanced Opt-Out + correct 'notifications' use case); otherwise fall
// back to the verified toll-free From number. Returns the Twilio message
// (with .sid). Twilio throws code 21610 if the recipient has opted out.
const twilioClient = require('extensions/common/mod/sms/instance');
const { senderPhoneNumber } = require('extensions/common/config/sms');

const MSID = process.env.TWILIO_MESSAGING_SERVICE_SID;

const twsend = async ({ body, phoneNumber, mediaUrls }) => {
  if (!body || !phoneNumber) return null;
  // Platform SMS is US-only (US 10DLC sender). International numbers must not
  // generate doomed Twilio sends - callers already treat null as 'not sent'.
  const digits = String(phoneNumber).replace(/\D/g, '');
  const usOk = (digits.length === 11 && digits[0] === '1') || digits.length === 10;
  if (!usOk) { console.log('[twsend] skipped non-US number'); return null; }
  // Normalize to E.164 rather than forwarding the caller's string. A stored
  // "2252883164" reached Twilio as "+2252883164", which it reads as country
  // code +225 (Cote d'Ivoire) and rejects: "The 'To' number is not a valid
  // phone number." That failed 904 times across 3 hosts who never got their
  // welcome text, because the queue re-pends a failed row every sweep.
  // usOk above guarantees NANP, so the last 10 digits + '+1' is always right.
  const to = `+1${digits.slice(-10)}`;
  const opts = MSID
    ? { body, to, messagingServiceSid: MSID }
    : { body, to, from: senderPhoneNumber };
  // Twilio caps MMS at 10 media per message.
  if (Array.isArray(mediaUrls) && mediaUrls.length) {
    opts.mediaUrl = mediaUrls.slice(0, 10);
  }
  return twilioClient.messages.create(opts);
};

module.exports = twsend;
