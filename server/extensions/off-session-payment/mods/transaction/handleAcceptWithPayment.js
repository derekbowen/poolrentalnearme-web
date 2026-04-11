const { transitions } = require('extensions/common/transactions/transactionProcessBooking');
const { types } = require('sharetribe-flex-sdk');

const { UUID } = types;

const handleAcceptWithPaymentTransition = ({ txId, params, trustedSdk }) => {
  const uuid = txId instanceof UUID ? txId : new UUID(txId.uuid);
  return trustedSdk.transactions.transition(
    {
      id: uuid,
      transition: transitions.ACCEPT_WITH_PAYMENT,
      params,
    },
    { expand: true }
  );
};

module.exports = handleAcceptWithPaymentTransition;
