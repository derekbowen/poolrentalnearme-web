import React, { useEffect, useRef, useState } from 'react';
import {
  requestAdditionalCharge,
  initiateAdditionalCharge,
  confirmAdditionalCharge,
} from '../../../util/api';
import { publishableKey } from '../../../config/configStripe';

// Host can request an extra charge once the booking is accepted (or later).
const ACCEPTED_TRANSITIONS = [
  'transition/accept',
  'transition/operator-accept',
  'transition/accept-with-payment',
  'transition/operator-accept-with-payment',
  'transition/complete',
  'transition/operator-complete',
];

const panelStyle = { marginTop: '16px', padding: '16px', borderTop: '1px solid #e5e7eb' };
const titleStyle = { fontSize: '14px', fontWeight: '600', marginBottom: '4px', color: '#111827' };
const subtitleStyle = { fontSize: '12px', color: '#6b7280', marginBottom: '12px' };
const fieldStyle = { marginBottom: '10px' };
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };
const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: '56px' };
const buttonStyle = { width: '100%', padding: '10px', background: '#009ed8', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' };
const buttonDisabledStyle = { ...buttonStyle, background: '#9fd6ef', cursor: 'not-allowed' };
const errorStyle = { fontSize: '12px', color: '#ef4444', marginTop: '6px' };
const noteBox = { fontSize: '13px', color: '#0b2733', padding: '10px 12px', background: '#e4f4fb', border: '1px solid #bce4f5', borderRadius: '8px', marginBottom: '10px' };
const okBox = { fontSize: '13px', color: '#059669', padding: '10px', background: '#ecfdf5', borderRadius: '6px', textAlign: 'center' };
const cardBox = { padding: '12px 10px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', marginBottom: '10px' };

const usd = cents => `$${(Number(cents || 0) / 100).toFixed(2)}`;

// Load Stripe.js on demand; resolve the shared instance.
const getStripe = () =>
  new Promise((resolve, reject) => {
    if (window.Stripe) return resolve(window.Stripe(publishableKey));
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () =>
      window.Stripe ? resolve(window.Stripe(publishableKey)) : reject(new Error('Stripe failed to load'));
    script.onerror = () => reject(new Error('Could not load the payment library. Check your connection.'));
    document.head.appendChild(script);
  });

/**
 * AdditionalCharge — lets the HOST request an extra charge (more guests/hours)
 * on an accepted booking, and lets the GUEST pay it by card. The payment runs
 * as a separate `additional-charge` transaction: initiate creates the Stripe
 * PaymentIntent, the guest confirms their card here, and /confirm captures.
 * "Paid" is only ever shown after the capture has really happened.
 */
const AdditionalCharge = ({ transaction, currentUser, provider, customer }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [inProgress, setInProgress] = useState(false);
  const [error, setError] = useState(null);
  // Guest payment steps: 'idle' -> 'card' (intent created, card form shown) -> 'done'
  const [payStep, setPayStep] = useState('idle');
  const payRef = useRef({ stripe: null, card: null, clientSecret: null, addonTxId: null });
  const cardMountRef = useRef(null);

  const txId = transaction?.id?.uuid;
  const currentUserId = currentUser?.id?.uuid;
  const providerId = provider?.id?.uuid;
  const customerId = customer?.id?.uuid;
  const isProvider = !!currentUserId && currentUserId === providerId;
  const isCustomer = !!currentUserId && currentUserId === customerId;
  const lastTransition = transaction?.attributes?.lastTransition;
  const isAccepted = ACCEPTED_TRANSITIONS.includes(lastTransition);
  const request = transaction?.attributes?.metadata?.additionalCharge || null;
  const status = request?.status;

  // Mount the Stripe card element when the card step opens.
  useEffect(() => {
    if (payStep !== 'card' || !payRef.current.stripe || !cardMountRef.current) return;
    const elements = payRef.current.stripe.elements();
    const card = elements.create('card', { style: { base: { fontSize: '16px' } } });
    card.mount(cardMountRef.current);
    payRef.current.card = card;
    return () => card.destroy();
  }, [payStep]);

  if (!txId || (!isProvider && !isCustomer)) return null;
  // Only relevant once the booking is confirmed.
  if (!isAccepted && !request) return null;

  const submitRequest = async e => {
    e.preventDefault();
    setError(null);
    const dollars = parseFloat(amount);
    if (!dollars || dollars < 1) {
      setError('Enter an amount of at least $1.00');
      return;
    }
    setInProgress(true);
    try {
      await requestAdditionalCharge({
        bookingTransactionId: txId,
        amount: Math.round(dollars * 100),
        reason: reason.trim(),
      });
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(err?.message || 'Could not send the request. Try again.');
      setInProgress(false);
    }
  };

  // Step 1: create the payment (intent) server-side, then show the card form.
  const payNow = async () => {
    setError(null);
    setInProgress(true);
    try {
      const stripe = await getStripe();
      const resp = await initiateAdditionalCharge({
        bookingTransactionId: txId,
        queryParams: { expand: true },
      });
      const addon = resp?.data?.data;
      const addonTxId = addon?.id?.uuid || addon?.id;
      const clientSecret =
        addon?.attributes?.protectedData?.stripePaymentIntents?.default
          ?.stripePaymentIntentClientSecret;
      if (!addonTxId || !clientSecret) {
        throw new Error('Could not start the payment. Please try again.');
      }
      payRef.current = { stripe, card: null, clientSecret, addonTxId };
      setPayStep('card');
      setInProgress(false);
    } catch (err) {
      setError(err?.message || "Payment couldn't be started. Try again.");
      setInProgress(false);
    }
  };

  // Step 2: guest entered their card — confirm with Stripe, then capture server-side.
  const confirmCard = async () => {
    setError(null);
    setInProgress(true);
    const { stripe, card, clientSecret, addonTxId } = payRef.current;
    try {
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });
      if (result.error) {
        throw new Error(result.error.message || 'Your card was declined.');
      }
      await confirmAdditionalCharge({
        bookingTransactionId: txId,
        addonTransactionId: addonTxId,
      });
      setPayStep('done');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err?.message || "Payment couldn't be completed. Try again.");
      setInProgress(false);
    }
  };

  // ── HOST view ──
  if (isProvider) {
    if (status === 'paid') {
      return (
        <div style={panelStyle}>
          <p style={titleStyle}>Additional charge</p>
          <p style={okBox}>Guest paid the additional {usd(request.amount)} ✓</p>
        </div>
      );
    }
    return (
      <div style={panelStyle}>
        <p style={titleStyle}>Charge for extra guests or hours</p>
        <p style={subtitleStyle}>
          {status === 'requested'
            ? `You requested ${usd(request.amount)}. Update it below, or wait for the guest to pay.`
            : "Request an extra payment from your guest. They'll pay it by card."}
        </p>
        <form onSubmit={submitRequest}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="addchg-amount">Amount (USD)</label>
            <input
              id="addchg-amount"
              style={inputStyle}
              type="number"
              min="1"
              step="0.01"
              placeholder="e.g. 50.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={inProgress}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="addchg-reason">Reason (shown to guest)</label>
            <textarea
              id="addchg-reason"
              style={textareaStyle}
              rows={2}
              placeholder="e.g. 2 extra guests + 1 more hour"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={280}
              disabled={inProgress}
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          <button type="submit" style={inProgress ? buttonDisabledStyle : buttonStyle} disabled={inProgress}>
            {inProgress ? 'Sending…' : status === 'requested' ? 'Update request' : 'Request charge'}
          </button>
        </form>
      </div>
    );
  }

  // ── GUEST view ──
  if (isCustomer && request) {
    if (status === 'paid' || payStep === 'done') {
      return (
        <div style={panelStyle}>
          <p style={titleStyle}>Additional charge</p>
          <p style={okBox}>You paid the additional {usd(request.amount)} ✓</p>
        </div>
      );
    }
    if (status === 'requested') {
      return (
        <div style={panelStyle}>
          <p style={titleStyle}>Your host requested an additional charge</p>
          <div style={noteBox}>
            <strong>{usd(request.amount)}</strong>
            {request.reason ? ` — ${request.reason}` : ''}
          </div>
          {payStep === 'card' ? (
            <>
              <div style={fieldStyle}>
                <label style={labelStyle}>Card details</label>
                <div style={cardBox} ref={cardMountRef} />
              </div>
              {error && <p style={errorStyle}>{error}</p>}
              <button
                type="button"
                style={inProgress ? buttonDisabledStyle : buttonStyle}
                disabled={inProgress}
                onClick={confirmCard}
              >
                {inProgress ? 'Processing…' : `Confirm payment of ${usd(request.amount)}`}
              </button>
              <p style={subtitleStyle}>Secured by Stripe. Your card details never touch our servers.</p>
            </>
          ) : (
            <>
              {error && <p style={errorStyle}>{error}</p>}
              <button
                type="button"
                style={inProgress ? buttonDisabledStyle : buttonStyle}
                disabled={inProgress}
                onClick={payNow}
              >
                {inProgress ? 'Starting…' : `Pay ${usd(request.amount)}`}
              </button>
              <p style={subtitleStyle}>Pay securely by card.</p>
            </>
          )}
        </div>
      );
    }
  }

  return null;
};

export default AdditionalCharge;
