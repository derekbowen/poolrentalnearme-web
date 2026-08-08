import React from 'react';

import ProgressHeader from './ProgressHeader';
import css from './HostOnboardingPage.module.css';

/**
 * The frame every numbered onboarding step renders inside: progress treatment on
 * top, the step's own content below, matching the approved board.
 *
 * The shell owns presentation only. It never talks to the SDK and never saves —
 * each step will hand its values to the EXISTING wizard panel/duck that already
 * knows how to persist them, so there is one set of business logic, not two.
 *
 * @param {Object} props
 * @param {number} props.step 1-based index of the current step
 * @param {string} props.heading the screen's question
 * @param {string} [props.sub] supporting line
 * @param {ReactNode} [props.children] step content
 */
const OnboardingShell = (props) => {
  const { step, heading, sub, children } = props;

  return (
    <div className={css.frame}>
      <ProgressHeader step={step} heading={heading} sub={sub} />
      <div className={css.stepBody}>{children}</div>
    </div>
  );
};

export default OnboardingShell;
