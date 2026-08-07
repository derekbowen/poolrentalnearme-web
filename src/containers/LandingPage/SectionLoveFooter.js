import React, { useEffect } from 'react';
import css from './SectionLoveFooter.module.css';

// PRNM birthday redesign (c132): the love closer rendered after the Console-managed
// sections — grouped socials, the device-aware app download, Text Derek (round-robin
// Twilio line, digits never printed), and the love note. The full SEO footer still
// renders below this via the normal FooterContainer; nothing is removed.
const SOCIALS = [
  ['Facebook', 'https://www.facebook.com/poolrentalnearme'],
  ['Instagram', 'https://www.instagram.com/poolrentalnearme'],
  ['TikTok', 'https://www.tiktok.com/@poolrentalnearme'],
  ['YouTube', 'https://www.youtube.com/@poolrentalnearme'],
  ['X', 'https://x.com/poolrentalnearme'],
  ['LinkedIn', 'https://www.linkedin.com/company/poolrentalnearme'],
  ['Pinterest', 'https://www.pinterest.com/poolrentalnearme'],
];

const APP_IOS = 'https://apps.apple.com/us/app/pool-rental-near-me-swim-fun/id6737762373';
const APP_ANDROID = 'https://play.google.com/store/apps/details?id=com.poolrentalnearme.app.prod';

const SMS_HREF =
  'sms:+18556178207?&body=' +
  encodeURIComponent('Hi Derek! I’m looking at Pool Rental Near Me and I have a question.');

const INTERCOM_APP_ID = 'nuuc4281'; // VITE_INTERCOM_APP_ID from .env; app ids are public client-side

const SectionLoveFooter = props => {
  const { sectionId } = props;
  useEffect(() => {
    if (typeof window === 'undefined' || window.Intercom) return;
    window.intercomSettings = { api_base: 'https://api-iam.intercom.io', app_id: INTERCOM_APP_ID };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://widget.intercom.io/widget/' + INTERCOM_APP_ID;
    document.head.appendChild(s);
  }, []);
  const onSmartApp = e => {
    if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
      e.preventDefault();
      window.location.href = APP_ANDROID;
    }
  };
  return (
    <section id={sectionId} className={css.root}>
      <div className={css.inner}>
        <div className={css.derekCard}>
          <div className={css.derekEmoji} aria-hidden="true">
            👋
          </div>
          <h2 className={css.derekTitle}>Stuck on anything? Text Derek.</h2>
          <p className={css.derekText}>
            He founded Pool Rental Near Me and answers hosts himself, usually within the hour.
          </p>
          <a className={css.quietBtn} href={SMS_HREF}>
            Text Derek
          </a>
        </div>

        <div className={css.socialCard}>
          <h2 className={css.socialTitle}>Swim with us everywhere 💙</h2>
          <div className={css.socialRow}>
            {SOCIALS.map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noopener noreferrer" className={css.socialChip}>
                {name}
              </a>
            ))}
          </div>
          <a className={css.appBtn} href={APP_IOS} onClick={onSmartApp}>
            📱 Get the app — it knows your phone
          </a>
          <div className={css.storeRow}>
            <a href={APP_IOS} target="_blank" rel="noopener noreferrer" className={css.storeLink} aria-label="Download on the App Store">
              <svg width="15" height="18" viewBox="0 0 384 512" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
                />
              </svg>
              App Store
            </a>
            <a href={APP_ANDROID} target="_blank" rel="noopener noreferrer" className={css.storeLink} aria-label="Get it on Google Play">
              <svg width="16" height="18" viewBox="0 0 576 512" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M420.6 301.9a24 24 0 1 1 24-24 24 24 0 0 1-24 24m-265.1 0a24 24 0 1 1 24-24 24 24 0 0 1-24 24m273.7-144.5 47.9-83a10 10 0 1 0-17.3-10h0l-48.5 84a301.3 301.3 0 0 0-246.6 0l-48.5-84a10 10 0 1 0-17.3 10h0l47.9 83C64.5 202.2 8.2 285.6 0 384h576c-8.2-98.5-64.5-181.8-146.9-226.6"
                />
              </svg>
              Google Play
            </a>
          </div>
        </div>

        <p className={css.loveNote}>Made with ❤️ for pool people.</p>
      </div>
    </section>
  );
};

export default SectionLoveFooter;
