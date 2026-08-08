import { types as sdkTypes } from '../../util/sdkLoader';

const { UUID } = sdkTypes;

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
