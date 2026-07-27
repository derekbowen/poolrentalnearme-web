const { getSdk } = require('../api-util/sdk');

/**
 * POST /api/send-offer
 *
 * Provider sends a custom-price package deal offer from an inquiry thread.
 * Transitions the transaction from state/inquiry → state/offer-sent.
 * The offer details are stored in protectedData.pendingOffer (visible to both parties).
 *
 * Body (JSON): { transactionId, negotiatedPriceCents, currency, note }
 */
module.exports = async (req, res) => {
  const { transactionId, negotiatedPriceCents, currency, note } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }
  // $25.00 floor (2500 cents). Keeps custom offers above the trust/processing
  // threshold; mirrored client-side in SendOfferPanel.
  if (typeof negotiatedPriceCents !== 'number' || negotiatedPriceCents < 2500) {
    return res.status(400).json({ error: 'Offer price must be at least $25.00.' });
  }

  const sdk = getSdk(req, res);

  try {
    const response = await sdk.transactions.transition({
      id: transactionId,
      transition: 'transition/send-offer',
      params: {
        protectedData: {
          pendingOffer: {
            negotiatedPriceCents,
            currency: currency || 'USD',
            note: note ? String(note).slice(0, 500) : '',
            createdAt: new Date().toISOString(),
          },
        },
      },
    });

    const { status, data } = response;
    res.status(status).json({ status, data });
  } catch (e) {
    const status = e?.status || 500;
    const message = e?.data?.errors?.[0]?.title || e?.message || 'Failed to send offer';
    res.status(status).json({ error: message });
  }
};
