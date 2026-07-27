const { getSdk, handleError } = require('../api-util/sdk');
const integrationSdk = require('../api-util/integration');

/**
 * POST /api/additional-charge/request
 * Body (JSON): { bookingTransactionId, amount, reason }
 *   - amount: integer in subunits (e.g. 5000 = $50.00)
 *
 * The HOST (provider of the booking) requests an extra charge for added guests/
 * hours. We store it as operator METADATA on the booking transaction so:
 *   - the guest can see + pay it, and
 *   - the amount is server-trusted (the guest cannot change what they owe).
 *
 * Auth: provider session (getSdk) — only the booking's provider may request.
 */
module.exports = async (req, res) => {
  const { bookingTransactionId, amount, reason } = req.body || {};
  const amountInt = Number.parseInt(amount, 10);

  if (!bookingTransactionId || !Number.isInteger(amountInt) || amountInt <= 0) {
    return res
      .status(400)
      .json({ error: 'bookingTransactionId and a positive integer amount (in subunits) are required.' });
  }
  if (!integrationSdk) {
    return res.status(500).json({ error: 'Integration API is not configured on this server.' });
  }

  const sdk = getSdk(req, res);
  try {
    // Verify the caller is the provider (host) of this booking.
    const [meRes, txRes] = await Promise.all([
      sdk.currentUser.show(),
      sdk.transactions.show({ id: bookingTransactionId, include: ['provider'] }),
    ]);
    const myId = meRes?.data?.data?.id?.uuid;
    const providerId = txRes?.data?.data?.relationships?.provider?.data?.id?.uuid;

    if (!myId || !providerId || myId !== providerId) {
      return res
        .status(403)
        .json({ error: 'Only the host of this booking can request an additional charge.' });
    }

    // Operator-write the pending request to the booking's metadata.
    await integrationSdk.transactions.updateMetadata({
      id: bookingTransactionId,
      metadata: {
        additionalCharge: {
          amount: amountInt,
          reason: (reason || '').toString().slice(0, 280),
          status: 'requested',
          requestedAt: new Date().toISOString(),
        },
      },
    });

    return res.json({ ok: true, amount: amountInt });
  } catch (e) {
    return handleError(res, e);
  }
};
