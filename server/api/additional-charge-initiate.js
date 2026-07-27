const { transactionLineItems } = require('../api-util/lineItems');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');

const PROCESS_ALIAS = 'additional-charge/release-1';

/**
 * POST /api/additional-charge/initiate
 * Body (JSON): { bookingTransactionId, isSpeculative, queryParams }
 *
 * The GUEST (customer of the booking) initiates the add-on payment the host
 * requested. The amount is read SERVER-SIDE from the booking's metadata
 * (host-set) — the client never supplies it, so it cannot be tampered.
 *
 * Returns a transit-serialized transaction (with its Stripe PaymentIntent) which
 * the client confirms via Stripe.js, then finalizes with transition/confirm-payment
 * through the existing /api/transition-privileged endpoint.
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

    // Mark the booking's request as paid (so the guest isn't prompted again) and
    // link the add-on transaction. Non-fatal if it fails — the charge succeeded.
    if (!isSpeculative && integrationSdk) {
      const addonTxId = apiResponse?.data?.data?.id?.uuid;
      try {
        await integrationSdk.transactions.updateMetadata({
          id: bookingTransactionId,
          metadata: {
            additionalCharge: {
              ...request,
              status: 'paid',
              paidAt: new Date().toISOString(),
              addonTransactionId: addonTxId,
            },
          },
        });
      } catch (mdErr) {
        // ignore — the status flag is cosmetic; the payment is what matters
      }
    }

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
