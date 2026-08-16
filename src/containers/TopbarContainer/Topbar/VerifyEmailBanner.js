import React, { useState } from 'react';

// c182: the email-verification nag that actually works. The dismissible modal
// (ModalMissingInformation) gets swatted away once and never seen again —
// meanwhile an unverified email hard-blocks accepting bookings (Sharetribe
// refuses the transition), so hosts stared at a dead Accept button with paid
// bookings waiting and no idea why. This banner is NOT dismissible, names the
// consequence, and can resend the link inline. It disappears the moment the
// email is verified, and hides on the verification page itself.
const VerifyEmailBanner = (props) => {
  const {
    isAuthenticated,
    currentUser,
    currentPage,
    onResendVerificationEmail,
    sendVerificationEmailInProgress,
  } = props;
  const [requested, setRequested] = useState(false);

  const attrs = currentUser?.attributes;
  const show =
    isAuthenticated &&
    attrs &&
    attrs.emailVerified === false &&
    currentPage !== 'EmailVerificationPage';
  if (!show) return null;

  const email = attrs.email || 'your email';
  const resend = () => {
    if (sendVerificationEmailInProgress) return;
    onResendVerificationEmail();
    setRequested(true);
  };

  return (
    <div
      style={{
        background: '#b45309',
        color: '#ffffff',
        padding: '10px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px 14px',
        fontSize: 14,
        lineHeight: 1.35,
        position: 'relative',
        zIndex: 60,
        textAlign: 'center',
      }}
    >
      <span>
        <strong>Verify your email to accept bookings and get paid.</strong> We sent a link to{' '}
        <strong>{email}</strong> &mdash; check spam too.
      </span>
      <button
        type="button"
        onClick={resend}
        disabled={sendVerificationEmailInProgress}
        style={{
          background: '#ffffff',
          color: '#92400e',
          border: 'none',
          borderRadius: 999,
          padding: '6px 14px',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {sendVerificationEmailInProgress ? 'Sending…' : requested ? 'Sent ✓ — send again' : 'Resend email'}
      </button>
    </div>
  );
};

export default VerifyEmailBanner;
