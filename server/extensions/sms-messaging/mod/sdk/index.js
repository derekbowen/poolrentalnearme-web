const { clientId } = require('extensions/sms-messaging/config/sdk');
const sharetribeSdk = require('sharetribe-flex-sdk');

const sdk = sharetribeSdk.createInstance({
  clientId,
});

module.exports = sdk;
