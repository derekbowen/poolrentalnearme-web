const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const { getTrustedSdk, getSdk } = require('../api-util/sdk');

/**
 * POST /api/check-verification-status
 *
 * Checks a Stripe Identity VerificationSession status. If verified, marks
 * the current user's protectedData.idVerifiedAt via the Integration API.
 *
 * Body (JSON): { sessionId }
 * Returns: { ok, verified, status? }
 */
module.exports = async (req, res) => {
  const { sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ ok: false, error: 'sessionId is required' });
  }

  try {
    const session = await stripe.identity.verificationSessions.retrieve(sessionId);

    if (session.status !== 'verified') {
      return res.json({ ok: true, verified: false, status: session.status });
    }

    // Get the current user's ID from their session
    const sdk = getSdk(req, res);
    const meResp = await sdk.currentUser.show({ include: [] });
    const userId = meResp.data.data.id;

    // Mark the user as ID-verified via the Integration API
    const trustedSdk = await getTrustedSdk(req);
    await trustedSdk.users.updateProfile(
      {
        id: userId,
        protectedData: { idVerifiedAt: new Date().toISOString() },
      },
      { expand: true }
    );

    return res.json({ ok: true, verified: true });
  } catch (e) {
    console.error('[check-verification-status]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
