const { totp } = require('otplib');

const verify = ({ otp, email }) => totp.check(otp, email);
module.exports = verify;
