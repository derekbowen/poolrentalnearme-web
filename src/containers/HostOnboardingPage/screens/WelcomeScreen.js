import React from 'react';

import { Wordmark } from '../ProgressHeader';
import css from '../HostOnboardingPage.module.css';

const HERO_SRC = '/static/onboarding/pool-hero.webp';

const Check = () => (
  <svg
    className={css.reassuranceIcon}
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M3 8.5 6.2 11.7 13 5"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Welcome screen, matching the approved Magic Patterns board: full-bleed pool
 * photograph with the wordmark floated over it, then the headline, the lede, the
 * reassurance list, and a single full-width action pinned to the bottom.
 *
 * Note on what is deliberately absent: the board also sketches an "Already
 * listed on Swimply?" secondary action. It is not rendered until the importer
 * actually imports something — a button that promises an import and delivers
 * manual setup is a broken promise, so it stays out rather than shipping
 * disabled or as "coming soon".
 *
 * @param {Object} props
 * @param {Function} [props.onGetStarted] invoked when the host taps through
 */
const WelcomeScreen = (props) => {
  const { onGetStarted } = props;

  return (
    <div className={css.frame}>
      <div className={css.hero}>
        <img
          className={css.heroImage}
          src={HERO_SRC}
          alt="A sunlit backyard swimming pool"
          width="1024"
          height="768"
        />
        <div className={css.heroBadge}>
          <Wordmark />
        </div>
      </div>

      <main className={css.welcomeMain}>
        <h1 className={css.welcomeTitle}>List your pool</h1>
        <p className={css.welcomeLede}>Start earning from your backyard.</p>
        <p className={css.welcomeBody}>
          It only takes a few minutes. You can change everything later.
        </p>

        <ul className={css.reassurance}>
          <li className={css.reassuranceItem}>
            <Check />
            Share your pool by the hour
          </li>
          <li className={css.reassuranceItem}>
            <Check />
            You choose the days and times
          </li>
          <li className={css.reassuranceItem}>
            <Check />
            Your address stays private
          </li>
        </ul>

        <div className={css.welcomeActions}>
          <button type="button" className={css.primaryButton} onClick={onGetStarted}>
            Get started
          </button>
        </div>
      </main>
    </div>
  );
};

export default WelcomeScreen;
