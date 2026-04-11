const { asyncRequestHandler } = require('extensions/common/utils/request');
const { createError } = require('extensions/common/utils/response');

const handlePaymentFailed = require('extensions/off-session-payment/mods/transaction/handlePaymentFailed');
const handleAcceptWithPaymentTransition = require('extensions/off-session-payment/mods/transaction/handleAcceptWithPayment');
const { getTrustedSdk } = require('api-util/sdk');

const acceptWithPayment = asyncRequestHandler(async (req) => {
  const { body, currentUser } = req;
  const { stripeConnected } = currentUser.attributes;
  if (!stripeConnected) {
    throw createError({
      status: 409,
      statusText: 'Conflict',
      message: 'Local API request failed',
      data: {
        errors: [
          {
            status: 409,
            code: 'transaction-missing-stripe-account',
            title: 'Provider has not yet created Stripe account.',
          },
        ],
      },
    });
  }

  try {
    const { txId, params } = body;
    const trustedSdk = await getTrustedSdk(req);
    const response = await handleAcceptWithPaymentTransition({ txId, params, trustedSdk });
    return response;
  } catch (error) {
    await handlePaymentFailed({ currentUser, txId: body.txId });
    throw error;
  }
});

exports.acceptWithPayment = acceptWithPayment;
