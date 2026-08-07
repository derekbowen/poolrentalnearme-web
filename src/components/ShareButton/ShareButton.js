import React, { useState } from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../util/reactIntl';

import css from './ShareButton.module.css';

/**
 * A prominent, mobile-first "Share this pool" button.
 *
 * On devices that support the native share sheet (most phones) it opens
 * navigator.share so the host/guest can text, message or AirDrop the listing.
 * Everywhere else (desktop Chrome, older browsers) it falls back to copying the
 * clean canonical URL to the clipboard and briefly confirms with "Link copied!".
 *
 * The button always hands out the exact `url` it is given — pass the clean
 * canonical listing URL, never the current address bar (which may carry query
 * params, tracking, or a Google SERP redirect).
 *
 * @component
 * @param {Object} props
 * @param {string} props.url - The clean canonical URL to share.
 * @param {string} props.title - The share sheet title (e.g. the listing title).
 * @param {string} [props.className]
 * @param {string} [props.rootClassName]
 * @returns {JSX.Element}
 */
const ShareButton = props => {
  const { className, rootClassName, url, title } = props;
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async shareUrl => {
    // Modern async clipboard API (requires https, which we have).
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      return true;
    }
    // Legacy fallback for older browsers.
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    }
    return false;
  };

  const handleShare = async () => {
    const shareUrl = url;
    if (!shareUrl) {
      return;
    }

    // Native share sheet — phones, tablets, and share-capable desktops.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch (e) {
        // User dismissed the sheet — do nothing, don't fall through to copy.
        if (e && e.name === 'AbortError') {
          return;
        }
        // Any other error: fall through to the copy-link fallback below.
      }
    }

    // Desktop / no-share fallback: copy the link and confirm.
    try {
      const ok = await copyToClipboard(shareUrl);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      }
    } catch (e) {
      // Ignore and fall through to the last-resort prompt.
    }

    // Last resort: show the URL so it can be copied manually.
    if (typeof window !== 'undefined' && window.prompt) {
      window.prompt('Copy this link:', shareUrl);
    }
  };

  const classes = classNames(rootClassName || css.root, className);

  return (
    <button
      type="button"
      className={classes}
      onClick={handleShare}
      aria-live="polite"
      data-copied={copied ? 'true' : 'false'}
    >
      <svg
        className={css.icon}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      <span className={css.label}>
        {copied ? (
          <FormattedMessage id="ShareButton.copied" />
        ) : (
          <FormattedMessage id="ShareButton.label" />
        )}
      </span>
    </button>
  );
};

export default ShareButton;
