const { asyncRequestHandler } = require('extensions/common/utils/request');
const send = require('extensions/common/mod/sms/send');
const generate = require('../../mod/otplib/generate');

const sendOTP = asyncRequestHandler(async (req) => {
  const { email, phoneNumber } = req.body;
  const otp = generate({ email });
  await send({ phoneNumber, body: `Your Pool Rentals Near Me OTP is ${otp}` });

  return {
    status: 200,
    data: 'OTP sent successfully',
  };
});

module.exports = sendOTP;
