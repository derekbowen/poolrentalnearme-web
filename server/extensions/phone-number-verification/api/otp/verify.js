const { asyncRequestHandler } = require('extensions/common/utils/request');
const { INVALID_OTP_CODE } = require('extensions/phone-number-verification/config/otp');
const { createError } = require('extensions/common/utils/response');
const verify = require('../../mod/otplib/verify');

const verifyOTP = asyncRequestHandler(async (req) => {
  const { otp, email } = req.body;
  const isValid = verify({ email, otp });

  if (!isValid) {
    throw createError({
      status: 400,
      statusText: INVALID_OTP_CODE,
      message: 'Invalid OTP',
      data: {
        errors: [
          {
            code: INVALID_OTP_CODE,
            title: 'Invalid OTP',
            status: 400,
          },
        ],
      },
    });
  }

  return {
    status: 200,
    data: 'OTP verified successfully',
  };
});

module.exports = verifyOTP;
