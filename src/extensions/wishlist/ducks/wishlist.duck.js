// ================ Action types ================ //

import { fetchCurrentUser } from '../../../ducks/user.duck';
import { storableError } from '../../../util/errors';
import { addListingToWishlist, removeListingFromWishlist } from '../api';

export const WISHLIST_ADD_LISTING_REQUEST = 'app/user/WISHLIST_ADD_LISTING_REQUEST';
export const WISHLIST_ADD_LISTING_SUCCESS = 'app/user/WISHLIST_ADD_LISTING_SUCCESS';
export const WISHLIST_ADD_LISTING_ERROR = 'app/user/WISHLIST_ADD_LISTING_ERROR';

export const WISHLIST_REMOVE_LISTING_REQUEST = 'app/user/WISHLIST_REMOVE_LISTING_REQUEST';
export const WISHLIST_REMOVE_LISTING_SUCCESS = 'app/user/WISHLIST_REMOVE_LISTING_SUCCESS';
export const WISHLIST_REMOVE_LISTING_ERROR = 'app/user/WISHLIST_REMOVE_LISTING_ERROR';

export const WISHLIST_FETCH_LISTING_INFO_REQUEST = 'app/user/WISHLIST_FETCH_LISTING_INFO_REQUEST';
export const WISHLIST_FETCH_LISTING_INFO_SUCCESS = 'app/user/WISHLIST_FETCH_LISTING_INFO_SUCCESS';
export const WISHLIST_FETCH_LISTING_INFO_ERROR = 'app/user/WISHLIST_FETCH_LISTING_INFO_ERROR';

// ================ Reducer ================ //

const initialState = {
  addingListing: null,
  addListingError: null,
  removingListing: null,
  removeListingError: null,
  fetchListingInfoInProgress: false,
  fetchListingInfoError: null,
};

export default function reducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case WISHLIST_ADD_LISTING_REQUEST:
      return {
        ...state,
        addingListing: payload.listingId,
        addListingError: null,
      };
    case WISHLIST_ADD_LISTING_SUCCESS:
      return {
        ...state,
        addingListing: null,
      };
    case WISHLIST_ADD_LISTING_ERROR:
      console.error(payload);
      return {
        ...state,
        addingListing: null,
        addListingError: payload,
      };
    case WISHLIST_REMOVE_LISTING_REQUEST:
      return {
        ...state,
        removingListing: payload.listingId,
        removeListingError: null,
      };
    case WISHLIST_REMOVE_LISTING_SUCCESS:
      return {
        ...state,
        removingListing: null,
      };
    case WISHLIST_REMOVE_LISTING_ERROR:
      console.error(payload);
      return {
        ...state,
        removingListing: null,
        removeListingError: payload,
      };
    default:
      return state;
  }
}

// ================ Action creators ================ //

export const addListingRequest = (listingId) => ({
  type: WISHLIST_ADD_LISTING_REQUEST,
  payload: { listingId },
});

export const addListingSuccess = (listingId) => ({
  type: WISHLIST_ADD_LISTING_SUCCESS,
  payload: { listingId },
});

export const addListingError = (e) => ({
  type: WISHLIST_ADD_LISTING_ERROR,
  error: true,
  payload: e,
});

export const removeListingRequest = (listingId) => ({
  type: WISHLIST_REMOVE_LISTING_REQUEST,
  payload: { listingId },
});

export const removeListingSuccess = (listingId) => ({
  type: WISHLIST_REMOVE_LISTING_SUCCESS,
  payload: { listingId },
});

export const removeListingError = (e) => ({
  type: WISHLIST_REMOVE_LISTING_ERROR,
  error: true,
  payload: e,
});

// ================ Thunks ================ //

export const removeWishlistListing = (listingId) => async (dispatch) => {
  try {
    dispatch(removeListingRequest(listingId));

    const response = await removeListingFromWishlist(listingId);

    dispatch(fetchCurrentUser());
    dispatch(removeListingSuccess(listingId));

    return response;
  } catch (err) {
    return dispatch(removeListingError(storableError(err)));
  }
};

export const addWishlistListing = (listingId) => async (dispatch) => {
  try {
    dispatch(addListingRequest(listingId));

    const response = await addListingToWishlist(listingId);

    dispatch(fetchCurrentUser());
    dispatch(addListingSuccess(listingId));

    return response;
  } catch (err) {
    return dispatch(addListingError(storableError(err)));
  }
};
