const integrationSdk = require('api-util/integration');
const {
  TX_TRANSITION_ACTOR_CUSTOMER,
  TX_TRANSITION_ACTOR_PROVIDER,
} = require('extensions/common/transactions/transaction');
const sendPaymentFailedNotification = require('../sms/sendPaymentFailedNotification');
const updateTransactionWithPaymentFailedFlag = require('./updateTransaction');

const sendFailedNotificationTo = async ({ user, role }) => {
  const { phoneNumber } = user.attributes.profile.protectedData;
  if (phoneNumber) {
    await sendPaymentFailedNotification({
      phoneNumber,
      role,
    });
  }
};

const handlePaymentFailed = async ({ currentUser, txId }) => {
  const tx = await integrationSdk.transactions.show({
    id: txId.uuid,
    include: ['customer'],
  });
  const {
    customer,
    attributes: { metadata },
  } = tx;
  const { paymentFailedAt } = metadata || {};

  if (!paymentFailedAt) {
    await sendFailedNotificationTo({
      user: customer,
      role: TX_TRANSITION_ACTOR_CUSTOMER,
    });
    await sendFailedNotificationTo({
      user: currentUser,
      role: TX_TRANSITION_ACTOR_PROVIDER,
    });
    await updateTransactionWithPaymentFailedFlag(txId);
  }
};

module.exports = handlePaymentFailed;
