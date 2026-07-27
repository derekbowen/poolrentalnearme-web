const {
  OTP_TIME_STEP,
  VITE_OTP_WINDOW,
} = require('extensions/phone-number-verification/config/otp');
const { totp } = require('otplib');

// Use the SAME step/window as generate.js so the validity window matches
// (previously verify used otplib defaults, which could disagree with generate).
totp.options = { step: +OTP_TIME_STEP, window: +VITE_OTP_WINDOW };

const verify = ({ otp, secret }) => totp.check(otp, secret);
module.exports = verify;
