const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Stripe Identity verification flows (configured in Stripe Dashboard → Identity).
// 'host'   — stricter: selfie + live capture + ID number + email + phone ownership.
// 'rental' — lighter:  selfie + live capture + document + phone ownership (lax for renters).
const VERIFICATION_FLOWS = {
  host:   'vf_1TjryKINbjTdiZ9IWcWoAKla',
  rental: process.env.STRIPE_IDENTITY_RENTAL_FLOW_ID || 'vf_1TjryKINbjTdiZ9IWcWoAKla', // set env once rental flow ID is known
};

/**
 * POST /api/create-verification-session
 *
 * Creates a Stripe Identity VerificationSession using the pre-configured
 * verification flow and returns the client_secret needed to launch the
 * hosted identity verification modal on the frontend.
 *
 * Body (JSON): { purpose: 'host' | 'rental' }  — defaults to 'rental'
 * Returns: { ok, sessionId, clientSecret }
 */
module.exports = async (req, res) => {
  const purpose = req.body?.purpose === 'host' ? 'host' : 'rental';
  const flowId = VERIFICATION_FLOWS[purpose];

  try {
    const session = await stripe.identity.verificationSessions.create({
      verification_flow: flowId,
    });

    return res.json({
      ok: true,
      sessionId: session.id,
      clientSecret: session.client_secret,
    });
  } catch (e) {
    console.error('[create-verification-session]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
