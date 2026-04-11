const { PROVIDER_MESSAGE, CUSTOMER_MESSAGE } = require('extensions/off-session-payment/config/sms');
const { TX_TRANSITION_ACTOR_PROVIDER } = require('extensions/common/transactions/transaction');

const sendSMS = require('./sendSMS');

const sendPaymentFailedNotification = ({ phoneNumber, role }) => {
  const messages = role === TX_TRANSITION_ACTOR_PROVIDER ? PROVIDER_MESSAGE : CUSTOMER_MESSAGE;
  return sendSMS({ phoneNumber, messages });
};

module.exports = sendPaymentFailedNotification;
