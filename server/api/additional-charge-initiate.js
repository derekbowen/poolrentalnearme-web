const { transactionLineItems } = require('../api-util/lineItems');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');

const PROCESS_ALIAS = 'additional-charge/release-1';

/**
 * POST /api/additional-charge/initiate
 * Body (JSON): { bookingTransactionId, isSpeculative, queryParams }
 *
 * The GUEST (customer of the booking) starts the add-on payment the host
 * requested. The amount is read SERVER-SIDE from the booking's metadata
 * (host-set) — the client never supplies it, so it cannot be tampered.
 *
 * This only CREATES the payment (transaction in pending-payment with a Stripe
 * PaymentIntent). The guest then confirms with their card via Stripe.js and the
 * client calls /api/additional-charge/confirm, which runs
 * transition/confirm-payment (capture) and only THEN marks the booking's
 * request as paid. Nothing here may claim the money moved — it hasn't yet.
 *
 * Auth: customer session (getSdk).
 */
module.exports = async (req, res) => {
  const { bookingTransactionId, isSpeculative, queryParams } = req.body || {};
  if (!bookingTransactionId) {
    return res.status(400).json({ error: 'bookingTransactionId is required.' });
  }

  const sdk = getSdk(req, res);
  try {
    const [meRes, txRes, commissionRes] = await Promise.all([
      sdk.currentUser.show(),
      sdk.transactions.show({ id: bookingTransactionId, include: ['listing', 'customer'] }),
      fetchCommission(sdk),
    ]);

    const myId = meRes?.data?.data?.id?.uuid;
    const tx = txRes?.data?.data;
    const customerId = tx?.relationships?.customer?.data?.id?.uuid;
    const listingId = tx?.relationships?.listing?.data?.id?.uuid;

    if (!myId || !customerId || myId !== customerId) {
      return res
        .status(403)
        .json({ error: 'Only the guest on this booking can pay an additional charge.' });
    }

    const request = tx?.attributes?.metadata?.additionalCharge;
    if (
      !request ||
      request.status !== 'requested' ||
      !Number.isInteger(request.amount) ||
      request.amount <= 0
    ) {
      return res.status(400).json({ error: 'No pending additional charge on this booking.' });
    }
    if (!listingId) {
      return res.status(400).json({ error: 'Could not resolve the booking listing.' });
    }

    // Server-trusted amount — ignore anything the client might send.
    const orderData = { additionalChargeAmount: request.amount };

    const listingRes = await sdk.listings.show({ id: listingId });
    const listing = listingRes.data.data;
    const commissionAsset = commissionRes.data.data[0];
    const { providerCommission, customerCommission } =
      commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

    const lineItems = transactionLineItems(
      listing,
      orderData,
      providerCommission,
      customerCommission
    );

    const trustedSdk = await getTrustedSdk(req);
    const body = {
      processAlias: PROCESS_ALIAS,
      transition: 'transition/request',
      params: {
        listingId,
        protectedData: {
          originTransactionId: bookingTransactionId,
          additionalChargeReason: request.reason || '',
        },
        lineItems,
      },
    };

    const apiResponse = isSpeculative
      ? await trustedSdk.transactions.initiateSpeculative(body, queryParams)
      : await trustedSdk.transactions.initiate(body, queryParams);

    const { status, statusText, data } = apiResponse;
    res
      .status(status)
      .set('Content-Type', 'application/transit+json')
      .send(serialize({ status, statusText, data }))
      .end();
  } catch (e) {
    return handleError(res, e);
  }
};
