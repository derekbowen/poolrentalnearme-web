const { getSdk, handleError, serialize } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');

/**
 * POST /api/additional-charge/confirm
 * Body (JSON): { bookingTransactionId, addonTransactionId }
 *
 * Called AFTER the guest confirmed the card payment via Stripe.js. Runs
 * transition/confirm-payment on the add-on transaction (server-side confirm +
 * capture), and only when that succeeds marks the booking's additionalCharge
 * request as paid. This is the single place the "paid" flag is written — the
 * money has actually been captured by the time it appears.
 *
 * Auth: customer session (getSdk); the caller must be the add-on transaction's
 * customer, and the add-on must point back at the booking it pays for.
 */
module.exports = async (req, res) => {
  const { bookingTransactionId, addonTransactionId } = req.body || {};
  if (!bookingTransactionId || !addonTransactionId) {
    return res
      .status(400)
      .json({ error: 'bookingTransactionId and addonTransactionId are required.' });
  }

  const sdk = getSdk(req, res);
  try {
    const [meRes, addonRes] = await Promise.all([
      sdk.currentUser.show(),
      sdk.transactions.show({ id: addonTransactionId, include: ['customer'] }),
    ]);

    const myId = meRes?.data?.data?.id?.uuid;
    const addon = addonRes?.data?.data;
    const addonCustomerId = addon?.relationships?.customer?.data?.id?.uuid;
    const origin = addon?.attributes?.protectedData?.originTransactionId;

    if (!myId || !addonCustomerId || myId !== addonCustomerId) {
      return res.status(403).json({ error: 'Only the guest on this payment can confirm it.' });
    }
    if (origin !== bookingTransactionId) {
      return res.status(400).json({ error: 'This payment does not belong to that booking.' });
    }

    // Customer-actor transition; confirm + capture happen inside the process.
    const apiResponse = await sdk.transactions.transition(
      { id: addonTransactionId, transition: 'transition/confirm-payment', params: {} },
      { expand: true }
    );

    // Capture succeeded — now, and only now, the booking shows paid.
    if (integrationSdk) {
      try {
        const bookingRes = await sdk.transactions.show({ id: bookingTransactionId });
        const request = bookingRes?.data?.data?.attributes?.metadata?.additionalCharge || {};
        await integrationSdk.transactions.updateMetadata({
          id: bookingTransactionId,
          metadata: {
            additionalCharge: {
              ...request,
              status: 'paid',
              paidAt: new Date().toISOString(),
              addonTransactionId,
            },
          },
        });
      } catch (mdErr) {
        // The capture is real even if the flag write hiccups; log and move on.
        console.error('additional-charge-confirm: metadata update failed', mdErr?.message);
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
