const {
  OTP_TIME_STEP,
  VITE_OTP_WINDOW,
} = require('extensions/phone-number-verification/config/otp');
const { totp } = require('otplib');

totp.options = { step: +OTP_TIME_STEP, window: +VITE_OTP_WINDOW };

// The secret must be a server-generated random secret (see api/otp/send.js),
// NEVER a user-supplied identifier like the email — that would let anyone
// compute a valid code offline with otplib's public defaults.
const generate = ({ secret }) => {
  return totp.generate(secret);
};

module.exports = generate;
