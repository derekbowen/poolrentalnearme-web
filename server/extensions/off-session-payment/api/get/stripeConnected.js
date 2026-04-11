const { asyncRequestHandler } = require('extensions/common/utils/request');
const integrationSdk = require('api-util/integration');

const getStripeConnected = asyncRequestHandler(async (req) => {
  const { userId } = req.params;
  const response = await integrationSdk.users.show({ id: userId });
  return {
    data: { stripeConnected: response.attributes.stripeConnected },
  };
});

exports.getStripeConnected = getStripeConnected;
