import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { NamedRedirect, Page } from '../../components';

import OnboardingShell from './OnboardingShell';
import WelcomeScreen from './screens/WelcomeScreen';
import AboutScreen from './screens/AboutScreen';
import { canWritePreviewData, hasPreviewAccess } from './previewAccess';
import { STEPS, WELCOME, stepIndexById } from './onboardingSteps';
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
 * Step values are collected in memory so the flow can be walked end to end, but
 * persistence is a separate, separately-gated batch: `canWrite` below is
 * threaded through now so the screens tell the truth about what is being saved,
 * and so turning writes on later is a change in one place rather than eight.
 *
 * The existing wizard at /l/new is completely untouched and remains the real
 * path for every host.
 */
export const HostOnboardingPageComponent = (props) => {
  const { scrollingDisabled, currentUserId } = props;

  // The gate is deliberately post-mount. hasPreviewAccess() reads sessionStorage
  // and the query string, so it can only ever answer false on the server — which
  // meant SSR always took the redirect branch, react-helmet never flushed, and
  // the route shipped with NO robots meta at all. Rendering Page with an empty
  // body during SSR emits "noindex, nofollow" on every request, and gating after
  // mount keeps server and first client render identical, so there is no
  // hydration mismatch either.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Which screen shows is derived from the URL, never held in state. Holding it
  // in state meant a restored page — iOS in-app webview resume, bfcache, reopening
  // a tab that was already here — brought back the old screen without any location
  // change, so the entry link came up on the step placeholder instead of Welcome.
  // A resetting effect could not fix that, because nothing re-rendered. Deriving
  // from the query string makes the entry URL deterministic: no `step`, no step.
  const location = useLocation();
  const navigate = useNavigate();
  const firstStep = STEPS[0];
  const screen =
    new URLSearchParams(location.search).get('step') === firstStep.id ? firstStep.id : WELCOME;

  // Answers live here rather than in each screen so moving back and forth does
  // not wipe what was typed. In-memory only for now, and deliberately so: a
  // half-built flow must not leave draft listings behind on a real marketplace.
  const [values, setValues] = useState({ title: '', description: '' });
  const patchValues = (patch) => setValues((prev) => ({ ...prev, ...patch }));

  // No step persists anything yet — the save path lands in the next batch. Until
  // it does, this stays false so an allowlisted operator is not shown a screen
  // that quietly implies their answers are being kept. The allowlist is wired up
  // and correct; it simply has nothing to authorise yet.
  const PERSISTENCE_ENABLED = false;
  const canWrite = PERSISTENCE_ENABLED && canWritePreviewData(currentUserId);

  const goTo = (stepId) => {
    const params = new URLSearchParams(location.search);
    if (stepId) {
      params.set('step', stepId);
    } else {
      params.delete('step');
    }
    const search = params.toString();
    navigate(search ? `?${search}` : location.pathname, { replace: false });
  };

  const allowed = mounted && hasPreviewAccess();

  let body = null;
  if (allowed && screen === WELCOME) {
    body = (
      <div className={css.root}>
        <WelcomeScreen onGetStarted={() => goTo(firstStep.id)} />
      </div>
    );
  } else if (allowed) {
    body = (
      <div className={css.root}>
        <OnboardingShell
          step={stepIndexById(firstStep.id)}
          heading={firstStep.heading}
          sub={firstStep.sub}
        >
          <AboutScreen
            values={values}
            onChange={patchValues}
            onContinue={() => goTo(null)}
            onBack={() => goTo(null)}
            readOnly={!canWrite}
          />
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

const mapStateToProps = (state) => {
  const { currentUser } = state.user;
  return {
    scrollingDisabled: isScrollingDisabled(state),
    // Only the id is read. The write gate compares against an allowlist of
    // operator ids, so nothing else about the user is needed here.
    currentUserId: currentUser?.id?.uuid || null,
  };
};

export default connect(mapStateToProps)(HostOnboardingPageComponent);
