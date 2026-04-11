const { accountSID, authToken } = require('extensions/common/config/sms');

const twilioClient = require('twilio')(accountSID, authToken);

module.exports = twilioClient;
