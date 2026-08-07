import React, { useState } from 'react';
import { createDeal } from '../../../util/api';

const panelStyle = { marginTop: '16px', padding: '16px', borderTop: '1px solid #e5e7eb' };
const titleStyle = { fontSize: '14px', fontWeight: '600', marginBottom: '4px', color: '#111827' };
const subtitleStyle = { fontSize: '12px', color: '#6b7280', marginBottom: '12px' };
const fieldStyle = { marginBottom: '10px' };
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };
const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: '64px' };
const buttonStyle = { width: '100%', padding: '10px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' };
const buttonDisabledStyle = { ...buttonStyle, background: '#93c5fd', cursor: 'not-allowed' };
const errorStyle = { fontSize: '12px', color: '#ef4444', marginTop: '4px', marginBottom: '4px' };
const linkBoxStyle = { fontSize: '13px', color: '#0c4a6e', padding: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', wordBreak: 'break-all' };

/**
 * SendOfferPanel — shown to the host. Creates a shareable "package deal" LINK
 * for this pool. The host sends the link to their guest however they already
 * talk (text, etc.); the guest opens it, picks a date, and pays the agreed
 * price. This works from any conversation — including old ones — because the
 * deal is tied to the listing, not to a version-locked message thread.
 */
const SendOfferPanel = ({ listingId }) => {
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [inProgress, setInProgress] = useState(false);
  const [error, setError] = useState(null);
  const [dealUrl, setDealUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum < 25) {
      setError('Enter a price of at least $25.00');
      return;
    }
    if (!listingId) {
      setError('Could not find this pool. Please refresh and try again.');
      return;
    }
    setInProgress(true);
    try {
      const resp = await createDeal({
        listingId,
        priceCents: Math.round(priceNum * 100),
        note: note.trim(),
      });
      if (!resp?.url) throw new Error('Could not create the deal link. Please try again.');
      setDealUrl(resp.url);
    } catch (err) {
      setError(err?.message || 'Could not create the deal link. Please try again.');
    } finally {
      setInProgress(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dealUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      /* clipboard blocked — the link is selectable in the box */
    }
  };

  if (dealUrl) {
    return (
      <div style={panelStyle}>
        <p style={titleStyle}>Your deal link is ready 🎉</p>
        <p style={subtitleStyle}>
          Send this link to your guest (text, email, anywhere). They open it, pick their date, and pay
          your price — no back-and-forth needed.
        </p>
        <div style={linkBoxStyle}>{dealUrl}</div>
        <button type="button" style={buttonStyle} onClick={copy}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button
          type="button"
          style={{ ...buttonStyle, background: '#e5e7eb', color: '#374151', marginTop: '8px' }}
          onClick={() => {
            setDealUrl(null);
            setPrice('');
            setNote('');
          }}
        >
          Create another deal
        </button>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <p style={titleStyle}>Send Package Deal</p>
      <p style={subtitleStyle}>
        Set a custom all-in price ($25.00 minimum) and get a link to send your guest. They pick a date
        and pay — it works even in older chats.
      </p>
      <a
        href="https://www.poolrentalnearme.com/p/course/the-booking-funnel-masterclass-from-click-to-confirmed-reservation?utm_source=host_dashboard&utm_medium=help_link&utm_campaign=feature_course&utm_content=custom_offer"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          margin: '0 0 12px',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--marketplaceColor, #009ed8)',
          textDecoration: 'none',
        }}
      >
        Learn how: The Booking Funnel Masterclass →
      </a>
      <form onSubmit={handleSubmit}>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="offer-price-input">Package Price (USD)</label>
          <input
            id="offer-price-input"
            style={inputStyle}
            type="number"
            min="25"
            step="0.01"
            placeholder="e.g. 150.00"
            value={price}
            onChange={e => setPrice(e.target.value)}
            required
            disabled={inProgress}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="offer-note-input">Note to Guest (optional)</label>
          <textarea
            id="offer-note-input"
            style={textareaStyle}
            rows={3}
            placeholder="e.g. Includes 3 hours + pool toys for Saturday"
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            disabled={inProgress}
          />
        </div>
        {error && <p style={errorStyle}>{error}</p>}
        <button type="submit" style={inProgress ? buttonDisabledStyle : buttonStyle} disabled={inProgress}>
          {inProgress ? 'Creating link…' : 'Create deal link'}
        </button>
      </form>
    </div>
  );
};

export default SendOfferPanel;
