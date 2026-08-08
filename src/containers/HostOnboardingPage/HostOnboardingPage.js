import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { NamedRedirect, Page } from '../../components';

import OnboardingShell from './OnboardingShell';
import WelcomeScreen from './screens/WelcomeScreen';
import { hasPreviewAccess } from './previewAccess';
import { STEPS, WELCOME } from './onboardingSteps';
import css from './HostOnboardingPage.module.css';

/**
 * Redesigned host onboarding — PRIVATE PREVIEW.
 *
 * This route exists so the new experience can be built and reviewed against the
 * real app without sending production hosts into unfinished screens. It:
 *
 *   - requires authentication (see routeConfiguration)
 *   - is noindex, and Disallow-ed in robots.txt
 *   - is linked from nowhere; you arrive via ?hostpreview=1
 *   - writes NOTHING — no draft is created, no listing is touched
 *
 * The existing wizard at /l/new is completely untouched and remains the real
 * path for every host.
 */
export const HostOnboardingPageComponent = (props) => {
  const { scrollingDisabled } = props;
  const [screen, setScreen] = useState(WELCOME);

  // The gate is deliberately post-mount. hasPreviewAccess() reads sessionStorage
  // and the query string, so it can only ever answer false on the server — which
  // meant SSR always took the redirect branch, react-helmet never flushed, and
  // the route shipped with NO robots meta at all. Rendering Page with an empty
  // body during SSR emits "noindex, nofollow" on every request, and gating after
  // mount keeps server and first client render identical, so there is no
  // hydration mismatch either.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Navigating to this URL again in a tab that is already on it does not remount
  // the component, so `screen` survived from a previous "Get started" tap and the
  // entry URL came up on the step placeholder instead of Welcome. Re-entering the
  // route must always land on Welcome.
  const location = useLocation();
  useEffect(() => setScreen(WELCOME), [location.key, location.pathname, location.search]);

  const allowed = mounted && hasPreviewAccess();
  const firstStep = STEPS[0];

  let body = null;
  if (allowed && screen === WELCOME) {
    body = (
      <div className={css.root}>
        <WelcomeScreen onGetStarted={() => setScreen(firstStep.id)} />
      </div>
    );
  } else if (allowed) {
    body = (
      <div className={css.root}>
        <OnboardingShell step={1} heading={firstStep.heading} sub={firstStep.sub}>
          <p className={css.placeholderNote}>
            This is the shell only. The step itself arrives in the next batch, wired to the listing
            panel that already saves this data — nothing is stored yet.
          </p>
          <button type="button" className={css.backLink} onClick={() => setScreen(WELCOME)}>
            &larr; Back to the start
          </button>
        </OnboardingShell>
      </div>
    );
  } else if (mounted) {
    body = <NamedRedirect name="LandingPage" />;
  }

  return (
    <Page
      title="List your pool"
      scrollingDisabled={scrollingDisabled}
      shouldIndex={false}
      shouldFollow={false}
      referrer="no-referrer"
    >
      {body}
    </Page>
  );
};

const mapStateToProps = (state) => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default connect(mapStateToProps)(HostOnboardingPageComponent);
