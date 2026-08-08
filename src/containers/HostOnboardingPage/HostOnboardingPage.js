import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';

import { types as sdkTypes } from '../../util/sdkLoader';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useConfiguration } from '../../context/configurationContext';
import {
  requestCreateListingDraft,
  requestShowListing,
  requestUpdateListing,
} from '../EditListingPage/EditListingPage.duck';
import { NamedRedirect, Page } from '../../components';

import {
  buildCreatePayload,
  buildUpdatePayload,
  findResumableDraft,
  listingIdFromResponse,
  readStep1Values,
} from './listingContract';

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
 *   - only WRITES for operators on the allowlist (see previewAccess)
 *
 * Step 1 creates and updates a real Sharetribe draft through the existing
 * EditListingPage thunks. One host gets one draft: the id lives in the URL, and
 * on entry without one we look up an existing draft from this flow rather than
 * starting another.
 *
 * The existing wizard at /l/new is completely untouched and remains the real
 * path for every host.
 */
const { UUID } = sdkTypes;

const DRAFT_PARAM = 'draft';

// Step 1 now persists. Enabled only after the write path was proven end to end
// against the :4000 validation image — a real draft created, updated in place,
// resumed after refresh, and verified in Sharetribe — not because it compiled.
const PERSISTENCE_ENABLED = true;

export const HostOnboardingPageComponent = (props) => {
  const {
    scrollingDisabled,
    currentUserId,
    onCreateDraft,
    onUpdateListing,
    onShowListing,
    onQueryOwnDrafts,
  } = props;

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
  // not wipe what was typed — including after a failed save.
  const [values, setValues] = useState({ title: '', description: '' });
  const patchValues = (patch) => setValues((prev) => ({ ...prev, ...patch }));

  const canWrite = PERSISTENCE_ENABLED && canWritePreviewData(currentUserId);

  // The draft id lives in the URL, not in component state. That is what makes
  // "one host, one draft" survive a refresh, back/forward, and reopening the tab:
  // every one of those rebuilds state from scratch but keeps the query string, so
  // the flow finds the existing draft and updates it instead of creating another.
  // Sharetribe remains the source of truth — this is only a pointer to it.
  const draftId = new URLSearchParams(location.search).get(DRAFT_PARAM);

  const [saveState, setSaveState] = useState('idle');
  const [resumed, setResumed] = useState(false);
  const [searchedForDraft, setSearchedForDraft] = useState(false);

  // Synchronous guard. setState is async, so a second tap can land before a
  // "saving" render ever happens; a ref flips immediately and closes that window,
  // which is what actually prevents a double-tap creating two drafts.
  const savingRef = useRef(false);

  // Declared before the effects that call it. useCallback keeps its identity
  // stable so it can sit in a dependency array without re-firing the lookup.
  const setDraftInUrl = useCallback(
    (id) => {
      const params = new URLSearchParams(location.search);
      params.set(DRAFT_PARAM, id);
      // replace, not push: the draft id is an attribute of where the host already
      // is, not a new place they navigated to, so Back must not step "before" it.
      navigate(`?${params.toString()}`, { replace: true });
    },
    [location.search, navigate]
  );

  // Arriving with no draft in the URL does NOT mean this host has no draft. They
  // may have closed the tab yesterday, or followed a "list your pool" link that
  // carries no id. Without this lookup every such visit starts another draft —
  // which is exactly how two test drafts appeared during the Batch 3 run.
  // Sharetribe stays the source of truth; the URL is only a pointer to it.
  useEffect(() => {
    if (!mounted || !canWrite || draftId || searchedForDraft) {
      return;
    }
    setSearchedForDraft(true);
    onQueryOwnDrafts().then((response) => {
      const existing = findResumableDraft(response?.data?.data);
      if (existing) {
        setDraftInUrl(existing);
      }
    });
  }, [mounted, canWrite, draftId, searchedForDraft, onQueryOwnDrafts, setDraftInUrl]);

  // Resume: if the URL carries a draft, load it and prefill from Sharetribe.
  useEffect(() => {
    if (!mounted || !canWrite || !draftId || resumed) {
      return;
    }
    setResumed(true);
    onShowListing({ id: new UUID(draftId) }).then((response) => {
      const listing = response?.data?.data;
      if (listing) {
        setValues(readStep1Values(listing));
      }
    });
  }, [mounted, canWrite, draftId, resumed, onShowListing]);

  const saveStep1 = async () => {
    if (!canWrite || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaveState('saving');

    try {
      const response = draftId
        ? await onUpdateListing(buildUpdatePayload(draftId, values))
        : await onCreateDraft(buildCreatePayload(values));

      // Both ducks resolve with an error ACTION instead of rejecting, so the only
      // trustworthy success signal is an id coming back. Treat anything else as a
      // failure rather than advancing on a save that never happened.
      const id = listingIdFromResponse(response);
      if (!id) {
        setSaveState('error');
        return;
      }
      if (!draftId) {
        setDraftInUrl(id);
      }
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
    } finally {
      savingRef.current = false;
    }
  };

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
            onContinue={saveStep1}
            onBack={() => goTo(null)}
            readOnly={!canWrite}
            saveState={saveState}
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

/**
 * Every write goes through the EXISTING EditListingPage thunks — the same code
 * path /l/new uses. No second listing engine, no bespoke SDK calls, and the 409
 * refetch-and-retry already built into requestUpdateListing comes along for free.
 *
 * The `tab` argument to requestUpdateListing only marks which wizard tab to flag
 * as updated in EditListingPage's own reducer; it does not affect what is written.
 */
/**
 * Read-only lookup of this host's own drafts.
 *
 * Deliberately NOT ManageListingsPage's queryOwnListings: that thunk dispatches
 * into the Manage Listings reducer (page result ids, pagination), so calling it
 * from here would quietly rewrite what that page shows. This only reads.
 */
const queryOwnDrafts = () => (dispatch, getState, sdk) =>
  sdk.ownListings.query({ states: ['draft'], perPage: 100 }).catch(() => null);

const mapDispatchToProps = (dispatch) => ({
  onCreateDraft: (data, config) => dispatch(requestCreateListingDraft(data, config)),
  onUpdateListing: (data, config) => dispatch(requestUpdateListing('details', data, config)),
  onShowListing: (payload, config) => dispatch(requestShowListing(payload, config)),
  onQueryOwnDrafts: () => dispatch(queryOwnDrafts()),
});

const HostOnboardingPageWithConfig = (props) => {
  // The thunks need the marketplace config for image variants; the container is
  // rendered inside the configuration provider, so read it here and bind it once
  // rather than making each call site remember to supply it.
  const { onCreateDraft, onUpdateListing, onShowListing } = props;
  const config = useConfiguration();
  return (
    <HostOnboardingPageComponent
      {...props}
      onCreateDraft={(data) => onCreateDraft(data, config)}
      onUpdateListing={(data) => onUpdateListing(data, config)}
      onShowListing={(payload) => onShowListing(payload, config)}
    />
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(HostOnboardingPageWithConfig);
