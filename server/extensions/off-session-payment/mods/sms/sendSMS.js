const twilioClient = require('extensions/common/mod/sms/instance');
const { senderPhoneNumber } = require('extensions/common/config/sms');

const sendSMS = ({ messages, phoneNumber }) =>
  twilioClient.messages.create({
    body: messages,
    from: senderPhoneNumber,
    to: phoneNumber,
  });

module.exports = sendSMS;
