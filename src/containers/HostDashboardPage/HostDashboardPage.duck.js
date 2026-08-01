import { storableError } from '../../util/errors';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { getAllTransitionsForEveryProcess } from '../../transactions/transaction';

// ================ Action types ================ //

export const FETCH_DASHBOARD_REQUEST = 'app/HostDashboardPage/FETCH_DASHBOARD_REQUEST';
export const FETCH_DASHBOARD_SUCCESS = 'app/HostDashboardPage/FETCH_DASHBOARD_SUCCESS';
export const FETCH_DASHBOARD_ERROR = 'app/HostDashboardPage/FETCH_DASHBOARD_ERROR';
export const FETCH_LISTINGS_SUCCESS = 'app/HostDashboardPage/FETCH_LISTINGS_SUCCESS';

// ================ Reducer ================ //

const initialState = {
  fetchInProgress: false,
  fetchError: null,
  transactionRefs: [],
  ownListingRefs: [],
};

const resultIds = data => data.data.map(tx => ({ id: tx.id, type: 'transaction' }));

export default function hostDashboardPageReducer(state = initialState, action = {}) {
  const { type, payload } = action;
  switch (type) {
    case FETCH_DASHBOARD_REQUEST:
      return { ...state, fetchInProgress: true, fetchError: null };
    case FETCH_DASHBOARD_SUCCESS:
      return { ...state, fetchInProgress: false, transactionRefs: resultIds(payload.data) };
    case FETCH_LISTINGS_SUCCESS:
      return {
        ...state,
        ownListingRefs: payload.data.data.map(l => ({ id: l.id, type: 'ownListing' })),
      };
    case FETCH_DASHBOARD_ERROR:
      return { ...state, fetchInProgress: false, fetchError: payload };
    default:
      return state;
  }
}

// ================ Action creators ================ //

const fetchDashboardRequest = () => ({ type: FETCH_DASHBOARD_REQUEST });
const fetchDashboardSuccess = response => ({ type: FETCH_DASHBOARD_SUCCESS, payload: response });
const fetchDashboardError = e => ({ type: FETCH_DASHBOARD_ERROR, error: true, payload: e });
const fetchListingsSuccess = response => ({ type: FETCH_LISTINGS_SUCCESS, payload: response });

// ================ Thunks ================ //

// One screen, one query. We pull the provider's recent sales and bucket them
// client-side rather than running several filtered queries — fewer round trips
// and it stays correct if the transaction process gains new transitions.
const DASHBOARD_PAGE_SIZE = 50;

export const loadData = () => (dispatch, getState, sdk) => {
  dispatch(fetchDashboardRequest());

  const params = {
    only: 'sale',
    lastTransitions: getAllTransitionsForEveryProcess(),
    include: ['listing', 'customer', 'customer.profileImage', 'booking'],
    'fields.transaction': [
      'processName',
      'lastTransition',
      'lastTransitionedAt',
      'payinTotal',
      'payoutTotal',
      'lineItems',
    ],
    'fields.listing': ['title', 'publicData.listingType'],
    'fields.user': ['profile.displayName', 'profile.abbreviatedName', 'deleted', 'banned'],
    'fields.image': ['variants.square-small', 'variants.square-small2x'],
    page: 1,
    perPage: DASHBOARD_PAGE_SIZE,
  };

  // Her pools ride along; a listings hiccup must never blank the dashboard.
  sdk.ownListings
    .query({
      include: ['images'],
      'fields.ownListing': ['title', 'state', 'price', 'metadata'],
      'fields.image': ['variants.square-small', 'variants.square-small2x', 'variants.landscape-crop', 'variants.landscape-crop2x'],
      perPage: 10,
    })
    .then(response => {
      dispatch(addMarketplaceEntities(response));
      dispatch(fetchListingsSuccess(response));
    })
    .catch(() => null);

  return sdk.transactions
    .query(params)
    .then(response => {
      dispatch(addMarketplaceEntities(response));
      dispatch(fetchDashboardSuccess(response));
      return response;
    })
    .catch(e => {
      dispatch(fetchDashboardError(storableError(e)));
      throw e;
    });
};
