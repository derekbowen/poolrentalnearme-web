import React, { useState } from 'react';

// Loads Stripe.js only if not already present (safe to call multiple times)
const loadStripeJs = publishableKey =>
  new Promise((resolve, reject) => {
    if (window.Stripe) {
      resolve(window.Stripe(publishableKey));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => resolve(window.Stripe(publishableKey));
    script.onerror = () => reject(new Error('Failed to load Stripe.js'));
    document.head.appendChild(script);
  });

/**
 * IdentityVerificationGate
 *
 * Blocks the user from proceeding until they complete a Stripe Identity
 * document check. On success, calls `onVerified()`.
 *
 * @param {string}   publishableKey  Stripe publishable key (config.stripe.publishableKey)
 * @param {string}   reason          One-sentence explanation shown to the user
 * @param {Function} onVerified      Callback fired when the user passes verification
 * @param {'host'|'rental'} purpose  Which Stripe Identity flow to use (default: 'rental')
 */
const IdentityVerificationGate = ({ publishableKey, reason, onVerified, purpose = 'rental' }) => {
  const [inProgress, setInProgress] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async () => {
    setInProgress(true);
    setError(null);

    try {
      const stripe = await loadStripeJs(publishableKey);

      // Create a VerificationSession on our server
      const sessionResp = await fetch('/api/create-verification-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ purpose }),
      });
      const session = await sessionResp.json();
      if (!session.ok) throw new Error(session.error || 'Could not start verification');

      // Launch Stripe Identity hosted modal
      const { error: stripeError } = await stripe.verifyIdentity(session.clientSecret);

      if (stripeError) {
        // user_canceled is not an error — they just closed the modal
        if (stripeError.code !== 'user_canceled') {
          throw new Error(stripeError.message);
        }
        setInProgress(false);
        return;
      }

      // Confirm the result on our server and mark the user
      const checkResp = await fetch('/api/check-verification-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const result = await checkResp.json();

      if (result.verified) {
        onVerified();
      } else {
        // Stripe sometimes takes a moment to process — let the user retry
        setError('Verification is still being processed. Please wait a moment and try again.');
        setInProgress(false);
      }
    } catch (e) {
      setError(e.message || 'Verification failed. Please try again.');
      setInProgress(false);
    }
  };

  return (
    <div
      style={{
        padding: '20px 24px',
        background: '#fefce8',
        border: '1px solid #fde047',
        borderRadius: '8px',
        marginBottom: '20px',
      }}
    >
      <p style={{ fontWeight: '700', fontSize: '15px', margin: '0 0 6px', color: '#713f12' }}>
        Identity verification required
      </p>
      <p style={{ fontSize: '13px', color: '#78350f', margin: '0 0 16px', lineHeight: '1.5' }}>
        {reason}
      </p>
      {error ? (
        <p style={{ fontSize: '13px', color: '#dc2626', margin: '0 0 12px' }}>{error}</p>
      ) : null}
      <button
        type="button"
        onClick={handleVerify}
        disabled={inProgress}
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '600',
          borderRadius: '6px',
          border: 'none',
          background: '#d97706',
          color: '#fff',
          cursor: inProgress ? 'default' : 'pointer',
          opacity: inProgress ? 0.65 : 1,
        }}
      >
        {inProgress ? 'Opening verification…' : 'Verify My ID'}
      </button>
      <p style={{ fontSize: '11px', color: '#92400e', margin: '10px 0 0', lineHeight: '1.4' }}>
        Powered by Stripe Identity — your government ID is reviewed by Stripe, not shared with
        Pool Rental Near Me.
      </p>
    </div>
  );
};

export default IdentityVerificationGate;
