import { addMarketplaceEntities } from '../../../../ducks/marketplaceData.duck';
import { fetchCurrentUser } from '../../../../ducks/user.duck';
import { storableError } from '../../../../util/errors';
import { createImageVariantConfig } from '../../../../util/sdkLoader';
import { parse } from '../../../../util/urlHelpers';
import { removeListingFromWishlist } from '../../api';
import {
  removeListingError,
  removeListingRequest,
  removeListingSuccess,
} from '../../ducks/wishlist.duck';

// Pagination page size might need to be dynamic on responsive page layouts
// Current design has max 4 columns 40 is divisible by 4
// So, there's enough cards to fill all columns on full pagination pages
const RESULT_PAGE_SIZE = 40;

// ================ Action types ================ //

export const CLEAR_PREVIOUS_STATE = 'app/EditListingPage/CLEAR_PREVIOUS_STATE';
export const FETCH_WISHLIST_SUCCESS = 'app/WishlistPage/FETCH_WISHLIST_SUCCESS';
export const FETCH_WISHLIST_ERROR = 'app/WishlistPage/FETCH_WISHLIST_ERROR';

// ================ Reducer ================ //

const initialState = {
  pagination: null,
  queryParams: null,
  queryInProgress: true,
  queryListingsError: null,
  currentPageResultIds: [],
};

const wishlistPageReducer = (state = initialState, action = {}) => {
  const { type, payload } = action;
  switch (type) {
    case CLEAR_PREVIOUS_STATE:
      return initialState;
    case FETCH_WISHLIST_SUCCESS:
      return {
        ...state,
        currentPageResultIds: payload.data.data.map((l) => l.id),
        pagination: payload.data.meta,
        queryInProgress: false,
      };
    case FETCH_WISHLIST_ERROR:
      // eslint-disable-next-line no-console
      console.error(payload);
      return { ...state, queryInProgress: false, queryListingsError: payload };
    default:
      return state;
  }
};

export default wishlistPageReducer;

// ================ Selectors ================ //

// ================ Action creators ================ //

export const clearPreviousState = () => ({
  type: CLEAR_PREVIOUS_STATE,
});

export const queryWishlistSuccess = (response) => ({
  type: FETCH_WISHLIST_SUCCESS,
  payload: { data: response.data },
});

export const queryWishlistError = (e) => ({
  type: FETCH_WISHLIST_ERROR,
  error: true,
  payload: e,
});

export const queryWishlist = (queryParams) => async (dispatch, getState, sdk) => {
  try {
    await dispatch(fetchCurrentUser());

    const { currentUser } = getState().user;

    const response = await sdk.listings.query({
      ...queryParams,
      meta_likedByUserIds: currentUser.id.uuid,
    });

    dispatch(addMarketplaceEntities(response));
    dispatch(queryWishlistSuccess(response));

    return response;
  } catch (err) {
    dispatch(queryWishlistError(storableError(err)));
    return Promise.reject(err);
  }
};

export const removeListing = (listingId) => async (dispatch, getState) => {
  try {
    dispatch(removeListingRequest(listingId));

    const response = await removeListingFromWishlist(listingId.uuid);
    const { queryParams } = getState().WishlistPage;

    await dispatch(queryWishlist(queryParams));
    dispatch(removeListingSuccess(listingId));

    return response;
  } catch (err) {
    dispatch(removeListingError(storableError(err)));
    return Promise.reject(err);
  }
};

export const loadData = (params, search, config) => (dispatch) => {
  dispatch(clearPreviousState());
  const queryParams = parse(search);
  const page = queryParams.page || 1;

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const aspectRatio = aspectHeight / aspectWidth;

  return dispatch(
    queryWishlist({
      ...queryParams,
      page,
      perPage: RESULT_PAGE_SIZE,
      include: ['images', 'author'],
      'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
      'fields.image': [
        'variants.scaled-small',
        'variants.scaled-medium',
        `variants.${variantPrefix}`,
        `variants.${variantPrefix}-2x`,
      ],
      ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
      ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
    })
  );
};
