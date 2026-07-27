// Send via the "Pool Rental Near Me" Messaging Service when configured (gives
// Twilio Advanced Opt-Out + correct 'notifications' use case); otherwise fall
// back to the verified toll-free From number. Returns the Twilio message
// (with .sid). Twilio throws code 21610 if the recipient has opted out.
const twilioClient = require('extensions/common/mod/sms/instance');
const { senderPhoneNumber } = require('extensions/common/config/sms');

const MSID = process.env.TWILIO_MESSAGING_SERVICE_SID;

const twsend = async ({ body, phoneNumber }) => {
  if (!body || !phoneNumber) return null;
  const opts = MSID
    ? { body, to: phoneNumber, messagingServiceSid: MSID }
    : { body, to: phoneNumber, from: senderPhoneNumber };
  return twilioClient.messages.create(opts);
};

module.exports = twsend;
