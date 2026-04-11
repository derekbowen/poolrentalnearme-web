const {
  OTP_TIME_STEP,
  VITE_OTP_WINDOW,
} = require('extensions/phone-number-verification/config/otp');
const { totp } = require('otplib');

totp.options = { step: +OTP_TIME_STEP, window: +VITE_OTP_WINDOW };

const generate = ({ email }) => {
  return totp.generate(email);
};

module.exports = generate;
