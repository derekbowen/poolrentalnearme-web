import React from 'react';

import { TOTAL_STEPS } from './onboardingSteps';
import css from './HostOnboardingPage.module.css';

/**
 * The wordmark used across the onboarding flow.
 *
 * Small and quiet by design — the approved board gives the screen's own heading
 * the weight, not the brand lockup.
 */
export const Wordmark = () => (
  <div className={css.wordmark}>
    Pool Rental <span className={css.wordmarkAccent}>Near Me</span>
  </div>
);

/**
 * Progress treatment from the approved board: a hairline track with a filled
 * portion, a small "Step N of M" label, then the screen's question as the
 * heading. Deliberately not a breadcrumb strip or a tab row.
 *
 * @param {Object} props
 * @param {number} props.step 1-based index of the current step
 * @param {number} [props.total] denominator, defaults to the real step count
 * @param {string} props.heading the screen's question
 * @param {string} [props.sub] supporting line under the heading
 */
const ProgressHeader = (props) => {
  const { step, total = TOTAL_STEPS, heading, sub } = props;
  const pct = Math.max(0, Math.min(100, (step / total) * 100));

  return (
    <header className={css.progressHeader}>
      <Wordmark />
      <div
        className={css.progressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={`Step ${step} of ${total}`}
      >
        <div className={css.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <p className={css.progressLabel}>
        Step {step} of {total}
      </p>
      <h1 className={css.stepHeading}>{heading}</h1>
      {sub ? <p className={css.stepSub}>{sub}</p> : null}
    </header>
  );
};

export default ProgressHeader;
