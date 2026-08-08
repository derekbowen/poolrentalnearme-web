import React, { useState } from 'react';
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

  // Server-side this is always false, so the preview is never rendered into SSR
  // output or served to a crawler.
  if (!hasPreviewAccess()) {
    return <NamedRedirect name="LandingPage" />;
  }

  const firstStep = STEPS[0];

  return (
    <Page
      title="List your pool"
      scrollingDisabled={scrollingDisabled}
      shouldIndex={false}
      shouldFollow={false}
      referrer="no-referrer"
    >
      <div className={css.root}>
        {screen === WELCOME ? (
          <WelcomeScreen onGetStarted={() => setScreen(firstStep.id)} />
        ) : (
          <OnboardingShell step={1} heading={firstStep.heading} sub={firstStep.sub}>
            <p className={css.placeholderNote}>
              This is the shell only. The step itself arrives in the next batch, wired to the
              listing panel that already saves this data — nothing is stored yet.
            </p>
          </OnboardingShell>
        )}
      </div>
    </Page>
  );
};

const mapStateToProps = (state) => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default connect(mapStateToProps)(HostOnboardingPageComponent);
