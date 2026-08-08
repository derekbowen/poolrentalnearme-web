import { types as sdkTypes } from '../../util/sdkLoader';
import { splitAddressForPrivacy } from '../../util/address';

const { UUID, Money } = sdkTypes;

/**
 * The listing-type contract every draft created by this flow must satisfy.
 *
 * These are CONSTANTS on purpose. They are never derived from anything the host
 * picks and are never shown as a choice, because the released iOS/Android build
 * cannot be changed and only understands this combination:
 *
 *   - `hourly-pool` is the only type the app's isValidListingType() accepts
 *     alongside a booking unit type it knows
 *   - `hour` is in the app's unit-type enum; `fixed` and `request` are not
 *   - `default-booking/release-1` is in the app's supportedProcess list;
 *     `default-negotiation` is not
 *
 * A listing created on any other combination renders "This listing is outdated"
 * in the app and the host cannot edit it there. See app-patches/ for the trace.
 * Do not make these configurable until the app ships a build that knows more.
 */
export const LISTING_TYPE = 'hourly-pool';
export const TRANSACTION_PROCESS_ALIAS = 'default-booking/release-1';
export const UNIT_TYPE = 'hour';

/**
 * Stamp identifying a draft that THIS flow created.
 *
 * Resume deliberately only ever picks up drafts carrying this marker. A host may
 * also have an unfinished draft from the existing /l/new wizard, and silently
 * adopting that one would drop them mid-flow into a listing they started
 * somewhere else, with different answers already saved. Better to leave other
 * drafts strictly alone.
 */
export const ONBOARDING_VERSION_KEY = 'onboardingVersion';
export const ONBOARDING_VERSION = 'v2';

/**
 * The host's most recent resumable draft from this flow, if any.
 *
 * Picks the newest by createdAt so that if a duplicate ever does slip through,
 * the host continues the one they were most recently working on rather than an
 * older abandoned shell.
 *
 * @param {Array} listings own-listing entities
 * @returns {string|null} listing uuid to resume
 */
export const findResumableDraft = (listings) => {
  const drafts = (listings || []).filter((l) => {
    const attrs = l?.attributes || {};
    const pd = attrs.publicData || {};
    return attrs.state === 'draft' && pd[ONBOARDING_VERSION_KEY] === ONBOARDING_VERSION;
  });

  if (drafts.length === 0) {
    return null;
  }

  const newest = drafts
    .slice()
    .sort((a, b) => new Date(b.attributes.createdAt) - new Date(a.attributes.createdAt))[0];

  return newest?.id?.uuid || null;
};

/**
 * Payload for the FIRST save — creates the draft.
 *
 * Only Step 1's own fields are sent, plus the pinned type trio. Nothing else is
 * touched: no price, no availability plan, no images, no payout details. That
 * keeps the draft in the state the wizard's own completeness gates expect and
 * avoids tripping any Stripe requirement before the host has been asked.
 *
 * @param {{title: string, description: string}} values
 * @returns {Object} data for requestCreateListingDraft
 */
export const buildCreatePayload = (values) => ({
  title: (values.title || '').trim(),
  description: (values.description || '').trim(),
  publicData: {
    listingType: LISTING_TYPE,
    transactionProcessAlias: TRANSACTION_PROCESS_ALIAS,
    unitType: UNIT_TYPE,
    [ONBOARDING_VERSION_KEY]: ONBOARDING_VERSION,
  },
});

/**
 * Payload for every SUBSEQUENT save — updates the same draft.
 *
 * The type trio is deliberately NOT resent. It is immutable for the life of the
 * listing, the stock wizard refuses to change it once set, and re-sending it on
 * every keystroke-save is a chance to clobber it with a typo for no benefit.
 *
 * @param {string} draftId uuid of the existing draft
 * @param {{title: string, description: string}} values
 * @returns {Object} data for requestUpdateListing
 */
export const buildUpdatePayload = (draftId, values) => ({
  id: new UUID(draftId),
  title: (values.title || '').trim(),
  description: (values.description || '').trim(),
});

/**
 * Payload for Step 2 — location.
 *
 * Mirrors EditListingLocationPanel exactly, including the privacy split, so the
 * new flow writes location the same way the existing wizard does:
 *
 *   geolocation              lat/lng, powers location search
 *   publicData.location      CITY LEVEL ONLY - what guests browsing can see
 *   privateData.exactAddress the street address, shared after a booking
 *
 * The street address must never reach publicData. 0 of 98 published listings
 * leak one today and this flow is not going to be the first.
 *
 * @param {string} draftId
 * @param {Object} selectedPlace from LocationAutocompleteInput
 * @param {string} [building] optional unit/building
 * @returns {Object} data for requestUpdateListing
 */
export const buildLocationPayload = (draftId, selectedPlace, building = '') => {
  const { address, origin, city, state, zip } = selectedPlace || {};
  const { publicLabel, exactAddress } = splitAddressForPrivacy(address, { city, state, zip });

  return {
    id: new UUID(draftId),
    geolocation: origin,
    publicData: { location: { address: publicLabel, building, city } },
    privateData: { exactAddress },
  };
};

/**
 * Pull the persisted Step 2 values back off a listing entity, for resume.
 *
 * Reads the EXACT address out of privateData, not the public city label — on
 * resume the host should see what they actually typed, not a truncated version
 * of it that they would then have to re-enter.
 *
 * @param {Object} listing
 * @returns {{address: string, building: string, hasLocation: boolean}}
 */
export const readStep2Values = (listing) => {
  const attrs = listing?.attributes || {};
  const pd = attrs.publicData || {};
  const exact = (attrs.privateData || {}).exactAddress;
  return {
    address: exact || pd.location?.address || '',
    building: pd.location?.building || '',
    hasLocation: !!attrs.geolocation,
  };
};

/**
 * Payload for a multi-enum step (features, rules).
 *
 * The chosen keys are written straight into publicData under the field's own
 * key, which is how the existing wizard stores them — so the same filters, the
 * same listing page sections and the same mobile app rendering pick them up
 * with no extra mapping.
 *
 * @param {string} draftId
 * @param {string} fieldKey e.g. 'poolAmenities'
 * @param {Array<string>} selected enum option keys
 */
export const buildMultiEnumPayload = (draftId, fieldKey, selected) => ({
  id: new UUID(draftId),
  publicData: { [fieldKey]: selected || [] },
});

/**
 * Payload for the pricing step.
 *
 * `price` is a Money instance in SUBUNITS — 7900 is $79.00. Passing dollars here
 * would silently price a pool at 79 cents an hour, so the conversion happens in
 * exactly one place.
 *
 * @param {string} draftId
 * @param {number} dollars whole-dollar hourly rate as typed by the host
 */
export const buildPricingPayload = (draftId, dollars) => ({
  id: new UUID(draftId),
  price: new Money(Math.round(Number(dollars) * 100), 'USD'),
});

/**
 * Payload for the availability step.
 *
 * Entries are the recurring weekly plan the existing wizard writes. An empty
 * entry list is legal and means "not bookable yet" — which is what a listing
 * should be until the host has actually chosen hours.
 *
 * @param {string} draftId
 * @param {Array} entries availability plan entries
 * @param {string} timezone IANA zone
 */
export const buildAvailabilityPayload = (draftId, entries, timezone) => ({
  id: new UUID(draftId),
  availabilityPlan: {
    type: 'availability-plan/time',
    timezone,
    entries: entries || [],
  },
});

/**
 * Read a multi-enum field back off a listing, for resume.
 */
export const readMultiEnum = (listing, fieldKey) => {
  const pd = listing?.attributes?.publicData || {};
  return Array.isArray(pd[fieldKey]) ? pd[fieldKey] : [];
};

/**
 * Read the hourly rate back as whole dollars, for resume.
 */
export const readPriceDollars = (listing) => {
  const amount = listing?.attributes?.price?.amount;
  return typeof amount === 'number' ? String(amount / 100) : '';
};

/**
 * Read the weekly availability entries back, for resume.
 */
export const readAvailabilityEntries = (listing) =>
  listing?.attributes?.availabilityPlan?.entries || [];

/**
 * Pull the persisted Step 1 values back off a listing entity, for resume.
 *
 * @param {Object} listing sdk listing entity
 * @returns {{title: string, description: string}}
 */
export const readStep1Values = (listing) => {
  const attrs = listing?.attributes || {};
  return {
    title: attrs.title || '',
    description: attrs.description || '',
  };
};

/**
 * Both ducks resolve their promise with an ERROR ACTION rather than rejecting
 * when the SDK call fails (`return dispatch(createListingDraftError(...))`), so
 * a caller that only try/catches would treat a failed save as a success. The
 * only reliable success signal is a listing id coming back on the response.
 *
 * @param {Object} response whatever the thunk resolved with
 * @returns {string|null} the listing uuid, or null if this was not a success
 */
export const listingIdFromResponse = (response) => response?.data?.data?.id?.uuid || null;
