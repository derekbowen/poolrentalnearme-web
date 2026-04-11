const integrationSdk = require('api-util/integration');
const { asyncRequestHandler } = require('extensions/common/utils/request');

const OPERATOR_ACCEPT = 'transition/operator-accept';
module.exports = asyncRequestHandler(async (req) => {
  const { txId } = req.body;

  const tx = await integrationSdk.transactions.show({
    id: txId,
    include: ['listing'],
  });

  const { listing } = tx;

  const isInstantBooking = listing?.attributes?.publicData?.isInstantBooking;
  if (!isInstantBooking) {
    return {
      status: 200,
      message: 'This transaction is not an instant booking transaction.',
      data: {
        success: true,
      },
    };
  }

  await integrationSdk.transactions.transition({
    id: txId,
    transition: OPERATOR_ACCEPT,
    params: {},
  });

  return {
    status: 200,
    message: 'Transaction accepted successfully.',
    data: {
      success: true,
    },
  };
});
