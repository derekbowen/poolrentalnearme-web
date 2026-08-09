import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';

import { types as sdkTypes } from '../../util/sdkLoader';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useConfiguration } from '../../context/configurationContext';
import {
  requestCreateListingDraft,
  requestImageUpload,
  requestPublishListingDraft,
  requestShowListing,
  requestUpdateListing,
} from '../EditListingPage/EditListingPage.duck';
import { NamedRedirect, Page } from '../../components';

import {
  buildAvailabilityPayload,
  buildCreatePayload,
  buildLocationPayload,
  buildMultiEnumPayload,
  buildPricingPayload,
  buildUpdatePayload,
  findResumableDraft,
  listingIdFromResponse,
  readAvailabilityEntries,
  readMultiEnum,
  readPriceDollars,
  readStep1Values,
  readStep2Values,
} from './listingContract';

import OnboardingShell from './OnboardingShell';
import WelcomeScreen from './screens/WelcomeScreen';
import AboutScreen from './screens/AboutScreen';
import LocationScreen from './screens/LocationScreen';
import MultiSelectScreen from './screens/MultiSelectScreen';
import PhotosScreen from './screens/PhotosScreen';
import PricingScreen from './screens/PricingScreen';
import AvailabilityScreen from './screens/AvailabilityScreen';
import ReviewScreen from './screens/ReviewScreen';
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

// Steps with a real screen behind them. Grows as each batch lands.
const IMPLEMENTED_STEPS = [
  'about',
  'location',
  'features',
  'rules',
  'photos',
  'pricing',
  'availability',
  'review',
];

// Guest fee, shown to hosts on the pricing step. Kept as a named constant so it
// is obvious this must track the checkout line items - a stale multiplier here
// once showed a host $77/hr on an $80.50 booking.
const GUEST_FEE_PERCENT = 15;

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
    onUploadImage,
    onPublishDraft,
    listingFields,
  } = props;

  // Options come from the hosted config, never a hardcoded list, so the flow can
  // only ever offer values the marketplace actually accepts.
  const optionsFor = (key) => (listingFields || []).find((f) => f.key === key)?.enumOptions || [];

  // The host's own zone, which is what "9am" means to them. The existing wizard
  // does the same rather than assuming marketplace time.
  const timezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'America/New_York';

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
  // Only steps that actually have a screen are routable. A ?step= for one that
  // is still unbuilt falls back to Welcome rather than rendering an empty shell.
  const requestedStep = new URLSearchParams(location.search).get('step');
  const screen = IMPLEMENTED_STEPS.includes(requestedStep) ? requestedStep : WELCOME;

  // Answers live here rather than in each screen so moving back and forth does
  // not wipe what was typed — including after a failed save.
  const [values, setValues] = useState({ title: '', description: '' });
  const patchValues = (patch) => setValues((prev) => ({ ...prev, ...patch }));

  // Step 2 keeps the raw autocomplete value: only a place PICKED from the
  // dropdown carries coordinates, so the whole object has to survive, not just
  // the text the host typed.
  const [locationValue, setLocationValue] = useState(null);
  const [building, setBuilding] = useState('');
  const [features, setFeatures] = useState([]);
  const [rules, setRules] = useState([]);
  const [priceDollars, setPriceDollars] = useState('');
  const [photos, setPhotos] = useState([]);
  const [days, setDays] = useState([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('20:00');

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
        setFeatures(readMultiEnum(listing, 'poolAmenities'));
        setRules(readMultiEnum(listing, 'houseRules'));
        setPriceDollars(readPriceDollars(listing));
        const entries = readAvailabilityEntries(listing);
        if (entries.length > 0) {
          setDays(entries.map((e) => e.dayOfWeek));
          setStartTime(entries[0].startTime);
          setEndTime(entries[0].endTime);
        }
        const step2 = readStep2Values(listing);
        setBuilding(step2.building);
        if (step2.hasLocation && step2.address) {
          // Rebuild an autocomplete-shaped value so the field shows the saved
          // address. selectedPlace carries the saved coordinates, so Continue is
          // immediately valid without forcing a re-pick.
          setLocationValue({
            search: step2.address,
            predictions: [],
            selectedPlace: {
              address: step2.address,
              origin: listing.attributes.geolocation,
            },
          });
        }
      }
    });
  }, [mounted, canWrite, draftId, resumed, onShowListing]);

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

  /**
   * One save path for every step. Each step supplies the payload it owns; the
   * create/update decision, the double-tap guard, the error handling and the
   * "did it actually persist" check are identical everywhere, so they live here
   * rather than being re-implemented per screen.
   */
  const saveStep = async (buildPayload, nextStepId) => {
    if (!canWrite || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaveState('saving');

    try {
      const response = draftId
        ? await onUpdateListing(buildPayload(draftId))
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
      if (nextStepId) {
        goTo(nextStepId);
      }
    } catch (e) {
      setSaveState('error');
    } finally {
      savingRef.current = false;
    }
  };

  const saveAbout = () => saveStep((id) => buildUpdatePayload(id, values), 'location');
  const saveLocation = () =>
    saveStep((id) => buildLocationPayload(id, locationValue?.selectedPlace, building), 'features');

  const saveFeatures = () =>
    saveStep((id) => buildMultiEnumPayload(id, 'poolAmenities', features), 'rules');

  const saveRules = () =>
    saveStep((id) => buildMultiEnumPayload(id, 'houseRules', rules), 'photos');

  const savePhotos = () =>
    saveStep(
      (id) => ({
        id: new UUID(id),
        images: photos.filter((p) => p.status === 'done').map((p) => new UUID(p.imageId)),
      }),
      'pricing'
    );

  const savePricing = () => saveStep((id) => buildPricingPayload(id, priceDollars), 'availability');

  const saveAvailability = () =>
    saveStep(
      (id) =>
        buildAvailabilityPayload(
          id,
          days.map((d) => ({ dayOfWeek: d, seats: 1, startTime, endTime })),
          timezone
        ),
      'review'
    );

  const toggleIn = (list, setList) => (key) =>
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  // Uploads run per file so one failure costs that photo, not the batch.
  const handleFilesPicked = (fileList) => {
    Array.from(fileList || []).forEach((file, i) => {
      const key = `${Date.now()}-${i}-${file.name}`;
      setPhotos((prev) => [...prev, { key, status: 'uploading', url: URL.createObjectURL(file) }]);
      onUploadImage({ id: key, file }).then((action) => {
        const imageId = action?.payload?.data?.imageId?.uuid;
        // Surface WHY it failed. The duck resolves with an error action rather
        // than rejecting, and it attaches fileInfo (type|name|size) to the error
        // — without showing that, a failed upload is an unexplained red box and
        // neither the host nor we can tell a 413 from an auth problem.
        const err = action?.error ? action?.payload?.error : null;
        const detail = err
          ? [err.status, err.statusText, err.message, err.fileInfo].filter(Boolean).join(' · ')
          : null;
        setPhotos((prev) =>
          prev.map((p) =>
            p.key === key ? { ...p, status: imageId ? 'done' : 'error', imageId, error: detail } : p
          )
        );
      });
    });
  };

  const publish = async () => {
    if (!draftId || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaveState('saving');
    try {
      const response = await onPublishDraft(new UUID(draftId));
      if (listingIdFromResponse(response)) {
        setSaveState('saved');
      } else {
        setSaveState('error');
      }
    } catch (e) {
      setSaveState('error');
    } finally {
      savingRef.current = false;
    }
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
    const step = STEPS.find((st) => st.id === screen);
    const readyPhotos = photos.filter((p) => p.status === 'done');

    const summary = {
      title: values.title,
      location: locationValue?.selectedPlace?.address,
      features: features.length ? `${features.length} selected` : '',
      rules: rules.length ? `${rules.length} selected` : '',
      photos: readyPhotos.length
        ? `${readyPhotos.length} photo${readyPhotos.length > 1 ? 's' : ''}`
        : '',
      price: priceDollars ? `$${priceDollars}/hr` : '',
      availability: days.length ? `${days.length} day${days.length > 1 ? 's' : ''} a week` : '',
    };

    // Only the things Sharetribe genuinely requires to publish. Features and
    // rules are optional and must not block a host from going live.
    const missing = [
      !values.title || !values.description ? 'name and description' : null,
      !locationValue?.selectedPlace?.origin ? 'address' : null,
      readyPhotos.length === 0 ? 'a photo' : null,
      !priceDollars ? 'an hourly rate' : null,
    ].filter(Boolean);

    const screens = {
      about: (
        <AboutScreen
          values={values}
          onChange={patchValues}
          onContinue={saveAbout}
          onBack={() => goTo(null)}
          readOnly={!canWrite}
          saveState={saveState}
        />
      ),
      location: (
        <LocationScreen
          value={locationValue}
          onChange={setLocationValue}
          building={building}
          onBuildingChange={setBuilding}
          onContinue={saveLocation}
          onBack={() => goTo('about')}
          saveState={saveState}
        />
      ),
      features: (
        <MultiSelectScreen
          options={optionsFor('poolAmenities')}
          selected={features}
          onToggle={toggleIn(features, setFeatures)}
          onContinue={saveFeatures}
          onBack={() => goTo('location')}
          emptyHint="Pick everything that applies - these are what guests filter on."
          saveState={saveState}
        />
      ),
      rules: (
        <MultiSelectScreen
          options={optionsFor('houseRules')}
          selected={rules}
          onToggle={toggleIn(rules, setRules)}
          onContinue={saveRules}
          onBack={() => goTo('features')}
          emptyHint="Leave blank if you'd rather talk it through with guests."
          saveState={saveState}
        />
      ),
      photos: (
        <PhotosScreen
          photos={photos}
          onFilesPicked={handleFilesPicked}
          onRemove={(key) => setPhotos((prev) => prev.filter((x) => x.key !== key))}
          onContinue={savePhotos}
          onBack={() => goTo('rules')}
          saveState={saveState}
        />
      ),
      pricing: (
        <PricingScreen
          value={priceDollars}
          onChange={setPriceDollars}
          guestFeePercent={GUEST_FEE_PERCENT}
          onContinue={savePricing}
          onBack={() => goTo('photos')}
          saveState={saveState}
        />
      ),
      availability: (
        <AvailabilityScreen
          days={days}
          onToggleDay={toggleIn(days, setDays)}
          startTime={startTime}
          endTime={endTime}
          onStartChange={setStartTime}
          onEndChange={setEndTime}
          timezone={timezone}
          onContinue={saveAvailability}
          onBack={() => goTo('pricing')}
          saveState={saveState}
        />
      ),
      review: (
        <ReviewScreen
          summary={summary}
          missing={missing}
          stripeConnected={false}
          onPublish={publish}
          onEditStep={(id) => goTo(id)}
          onBack={() => goTo('availability')}
          saveState={saveState}
        />
      ),
    };

    const stepScreen = screens[screen] || screens.about;

    body = (
      <div className={css.root}>
        <OnboardingShell step={stepIndexById(step.id)} heading={step.heading} sub={step.sub}>
          {stepScreen}
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
  onUploadImage: (payload, config) => dispatch(requestImageUpload(payload, config)),
  onPublishDraft: (id) => dispatch(requestPublishListingDraft(id)),
});

const HostOnboardingPageWithConfig = (props) => {
  // The thunks need the marketplace config for image variants; the container is
  // rendered inside the configuration provider, so read it here and bind it once
  // rather than making each call site remember to supply it.
  const { onCreateDraft, onUpdateListing, onShowListing, onUploadImage } = props;
  const config = useConfiguration();
  return (
    <HostOnboardingPageComponent
      {...props}
      onCreateDraft={(data) => onCreateDraft(data, config)}
      onUpdateListing={(data) => onUpdateListing(data, config)}
      onShowListing={(payload) => onShowListing(payload, config)}
      onUploadImage={(payload) => onUploadImage(payload, config.layout.listingImage)}
      listingFields={config.listing.listingFields}
    />
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(HostOnboardingPageWithConfig);
