const integrationSdk = require('api-util/integration');

const updateTransactionWithPaymentFailedFlag = (txId) => {
  return integrationSdk.transactions.updateMetadata({
    id: txId.uuid,
    metadata: {
      paymentFailedAt: Date.now(),
    },
  });
};

module.exports = updateTransactionWithPaymentFailedFlag;
