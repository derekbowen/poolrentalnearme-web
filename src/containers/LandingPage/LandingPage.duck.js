import { createImageVariantConfig } from '../../util/sdkLoader';
import { storableError } from '../../util/errors';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { resolveHomepageCategoryIds } from './homepageInventory';

// Homepage inventory comes straight from the Marketplace API: the newest general listings plus
// the Indoor / Heated / Night-swimming categories (ids resolved from the Console
// listing-categories asset). Eligibility + seasonal ranking happen in homepageInventory.js.
const GENERAL_PAGE_SIZE = 24;
const CATEGORY_PAGE_SIZE = 12;

// 5:4 card photos (the /s "listing-card" variants are cropped to the search-page aspect ratio).
export const HOME_IMAGE_VARIANT = 'home-card';
export const HOME_IMAGE_VARIANTS = [HOME_IMAGE_VARIANT, `${HOME_IMAGE_VARIANT}-2x`];
const HOME_IMAGE_ASPECT = 4 / 5;

// ================ Action types ================ //

export const HOMEPAGE_LISTINGS_REQUEST = 'app/LandingPage/HOMEPAGE_LISTINGS_REQUEST';
export const HOMEPAGE_LISTINGS_SUCCESS = 'app/LandingPage/HOMEPAGE_LISTINGS_SUCCESS';
export const HOMEPAGE_LISTINGS_ERROR = 'app/LandingPage/HOMEPAGE_LISTINGS_ERROR';

// ================ Reducer ================ //

const initialState = {
  listingIds: [],
  // Marketplace-wide count of bookable published listings (meta.totalItems of the general
  // query), not the page size — the homepage must never print the API page size as a count.
  totalListings: null,
  categoryIds: { indoor: null, heated: null, night: null },
  fetchInProgress: false,
  fetchError: null,
};

export default function landingPageReducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case HOMEPAGE_LISTINGS_REQUEST:
      return {
        ...state,
        categoryIds: payload.categoryIds,
        fetchInProgress: true,
        fetchError: null,
      };
    case HOMEPAGE_LISTINGS_SUCCESS:
      return {
        ...state,
        listingIds: payload.listingIds,
        totalListings: payload.totalListings,
        fetchInProgress: false,
      };
    case HOMEPAGE_LISTINGS_ERROR:
      return { ...state, fetchInProgress: false, fetchError: payload };
    default:
      return state;
  }
}

// ================ Action creators ================ //

export const homepageListingsRequest = (categoryIds) => ({
  type: HOMEPAGE_LISTINGS_REQUEST,
  payload: { categoryIds },
});
export const homepageListingsSuccess = (listingIds, totalListings = null) => ({
  type: HOMEPAGE_LISTINGS_SUCCESS,
  payload: { listingIds, totalListings },
});
export const homepageListingsError = (e) => ({
  type: HOMEPAGE_LISTINGS_ERROR,
  error: true,
  payload: e,
});

// ================ Thunks ================ //

const baseQueryParams = (config) => {
  const listingTypes = config.listing?.listingTypes || [];
  const listingTypeMaybe =
    config.listing?.enforceValidListingType && listingTypes.length > 0
      ? { pub_listingType: listingTypes.map((l) => l.listingType) }
      : {};

  return {
    ...listingTypeMaybe,
    // Same stock rule /s applies without a dates filter: keep bookable listings, drop the
    // ones that are explicitly out of stock.
    minStock: 1,
    stockMode: 'match-undefined',
    // Newest first (the API sorts descending unless the key is prefixed with "-").
    sort: 'createdAt',
    include: ['author', 'images'],
    'fields.listing': [
      'title',
      'price',
      'deleted',
      'state',
      'createdAt',
      'publicData.listingType',
      'publicData.transactionProcessAlias',
      'publicData.unitType',
      'publicData.location',
      'publicData.categoryLevel1',
      'publicData.guestallowed',
      'publicData.maxGuests',
      'publicData.poolAmenities',
      'publicData.heated',
      'publicData.avgRating',
      'publicData.reviewCount',
      'publicData.swimplyIcalUrl',
      'publicData.proHost',
    ],
    'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
    'fields.image': [...HOME_IMAGE_VARIANTS.map((v) => `variants.${v}`), 'variants.scaled-small'],
    ...createImageVariantConfig(HOME_IMAGE_VARIANTS[0], 480, HOME_IMAGE_ASPECT),
    ...createImageVariantConfig(HOME_IMAGE_VARIANTS[1], 960, HOME_IMAGE_ASPECT),
    'limit.images': 1,
  };
};

const isLive = (listing) =>
  listing.attributes?.state === 'published' && !listing.attributes?.deleted;

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  const categoryIds = resolveHomepageCategoryIds(config.categoryConfiguration?.categories);
  dispatch(homepageListingsRequest(categoryIds));

  const base = baseQueryParams(config);
  const queries = [
    { ...base, perPage: GENERAL_PAGE_SIZE },
    ...Object.values(categoryIds)
      .filter(Boolean)
      .map((id) => ({ ...base, perPage: CATEGORY_PAGE_SIZE, pub_categoryLevel1: id })),
  ];
  const sanitizeConfig = { listingFields: config.listing?.listingFields };

  // One failing category query must not blank the homepage: each query settles on its own and
  // whatever came back is merged (deduped, general inventory first).
  return Promise.all(
    queries.map((q) =>
      sdk.listings
        .query(q)
        .then((response) => ({ response }))
        .catch((error) => ({ error }))
    )
  ).then((results) => {
    const succeeded = results.filter((r) => r.response);
    if (succeeded.length === 0) {
      dispatch(homepageListingsError(storableError(results[0]?.error || new Error('no data'))));
      return;
    }
    const seen = {};
    const listingIds = [];
    succeeded.forEach(({ response }) => {
      dispatch(addMarketplaceEntities(response, sanitizeConfig));
      (response.data?.data || []).forEach((listing) => {
        const key = listing.id?.uuid;
        if (key && !seen[key] && isLive(listing)) {
          seen[key] = true;
          listingIds.push(listing.id);
        }
      });
    });
    const general = results[0]?.response?.data?.meta?.totalItems;
    dispatch(homepageListingsSuccess(listingIds, Number.isInteger(general) ? general : null));
  });
};
