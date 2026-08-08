import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { NamedRedirect, Page } from '../../components';

import OnboardingShell from './OnboardingShell';
import WelcomeScreen from './screens/WelcomeScreen';
import { hasPreviewAccess } from './previewAccess';
import { STEPS, WELCOME } from './onboardingSteps';
import css from './HostOnboardingPage.module.css';

// TEMPORARY DIAGNOSTIC marker — bumped per instrumented build so a screenshot
// proves which bundle is executing. Remove with the debug panel.
const BUILD_MARKER = 'c168-debug2';

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

  // TEMPORARY DIAGNOSTIC — instrumentation only, no logic changed. Remove once
  // the entry-screen behaviour is explained. Covers everything an independent
  // review asked for: which bundle is executing, how the document was navigated
  // to, whether it came out of bfcache, and the router's own view of the URL.
  const [persisted, setPersisted] = useState('no pageshow yet');
  useEffect(() => {
    const onShow = (e) => setPersisted(e.persisted ? 'TRUE (bfcache restore)' : 'false');
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  let chunkUrl = 'n/a';
  try {
    chunkUrl = (import.meta && import.meta.url) || 'n/a';
  } catch (e) {
    chunkUrl = 'unavailable (legacy bundle)';
  }

  let navType = 'n/a';
  try {
    const nav = window.performance.getEntriesByType('navigation')[0];
    navType = nav ? nav.type : 'n/a';
  } catch (e) {
    navType = 'unavailable';
  }

  const q = new URLSearchParams(location.search);
  const debug = mounted ? (
    <pre className={css.debugPanel}>
      {[
        `BUILD          ${BUILD_MARKER}`,
        `chunk          ${String(chunkUrl).split('/').pop()}`,
        `legacy bundle  ${String(chunkUrl).includes('-legacy-')}`,
        '',
        `pathname       ${location.pathname}`,
        `search         ${location.search || '(empty)'}`,
        `href           ${window.location.href}`,
        `location.key   ${location.key}`,
        `referrer       ${document.referrer || '(none)'}`,
        '',
        `step parsed    ${q.get('step') === null ? '(absent)' : q.get('step')}`,
        `hostpreview    ${q.get('hostpreview') === null ? '(absent)' : q.get('hostpreview')}`,
        `screen         ${screen}`,
        `renders        ${screen === WELCOME ? 'WELCOME' : 'ABOUT'}`,
        `allowed        ${String(allowed)}`,
        '',
        `nav type       ${navType}`,
        `bfcache        ${persisted}`,
      ].join('\n')}
    </pre>
  ) : null;

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
        <OnboardingShell step={1} heading={firstStep.heading} sub={firstStep.sub}>
          <p className={css.placeholderNote}>
            This is the shell only. The step itself arrives in the next batch, wired to the listing
            panel that already saves this data — nothing is stored yet.
          </p>
          <button type="button" className={css.backLink} onClick={() => goTo(null)}>
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
      {debug}
      {body}
    </Page>
  );
};

const mapStateToProps = (state) => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default connect(mapStateToProps)(HostOnboardingPageComponent);
