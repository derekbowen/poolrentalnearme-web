const { asyncRequestHandler } = require('extensions/common/utils/request');
const { createError } = require('extensions/common/utils/response');
const { EXCEED_RATE_LIMIT_CODE } = require('extensions/phone-number-verification/config/otp');
const send = require('extensions/common/mod/sms/send');
const otpStore = require('../../mod/otpStore');

const sendOTP = asyncRequestHandler(async (req) => {
  const { email, phoneNumber } = req.body;

  // International numbers can't reliably receive our US-originated OTP SMS.
  // Non-+1 requests get a success-shaped skip so no client dead-ends here.
  if (phoneNumber && !String(phoneNumber).startsWith('+1')) {
    return { status: 200, data: 'OTP skipped for non-US number' };
  }

  const otp = otpStore.issue({ email, phoneNumber });
  if (!otp) {
    throw createError({
      status: 429,
      statusText: EXCEED_RATE_LIMIT_CODE,
      message: 'Too many codes requested for this number. Please try again later.',
      data: {
        errors: [
          {
            code: EXCEED_RATE_LIMIT_CODE,
            title: 'Rate limit exceeded',
            status: 429,
          },
        ],
      },
    });
  }

  await send({ phoneNumber, body: `Your Pool Rentals Near Me OTP is ${otp}` });

  return {
    status: 200,
    data: 'OTP sent successfully',
  };
});

module.exports = sendOTP;
