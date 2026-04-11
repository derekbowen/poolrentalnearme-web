const { OTP_TIME_STEP, VITE_OTP_WINDOW } = process.env;

const EXCEED_RATE_LIMIT_CODE = 'exceed-rate-limit';
const INVALID_OTP_CODE = 'invalid-otp';

module.exports = {
  OTP_TIME_STEP,
  VITE_OTP_WINDOW,
  EXCEED_RATE_LIMIT_CODE,
  INVALID_OTP_CODE,
};
