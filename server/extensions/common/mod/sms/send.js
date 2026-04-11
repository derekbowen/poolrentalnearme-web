const { senderPhoneNumber } = require('extensions/common/config/sms');
const twilioClient = require('./instance');

const send = ({ body, phoneNumber }) => {
  if (!body || !phoneNumber) return null;

  return twilioClient.messages.create({
    body,
    from: senderPhoneNumber,
    to: phoneNumber,
  });
};

module.exports = send;
