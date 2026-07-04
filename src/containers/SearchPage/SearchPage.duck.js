import isEqual from 'lodash/isEqual';
import { SORT_BY_DISTANCE } from 'config/configSearch';
import { createImageVariantConfig } from '../../util/sdkLoader';
import { isErrorUserPendingApproval, isForbiddenError, storableError } from '../../util/errors';
import { convertUnitToSubUnit, unitDivisor } from '../../util/currency';
import {
  parseDateFromISO8601,
  getExclusiveEndDate,
  addTime,
  subtractTime,
  daysBetween,
  getStartOf,
} from '../../util/dates';
import { constructQueryParamName, isOriginInUse, isStockInUse } from '../../util/search';
import { hasPermissionToViewData, isUserAuthorized } from '../../util/userHelpers';
import { parse } from '../../util/urlHelpers';

import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';

// Pagination page size might need to be dynamic on responsive page layouts
// Current design has max 3 columns 12 is divisible by 2 and 3
// So, there's enough cards to fill all columns on full pagination pages
const RESULT_PAGE_SIZE = 24;

// ================ Action types ================ //

export const SEARCH_LISTINGS_REQUEST = 'app/SearchPage/SEARCH_LISTINGS_REQUEST';
export const SEARCH_LISTINGS_SUCCESS = 'app/SearchPage/SEARCH_LISTINGS_SUCCESS';
export const SEARCH_LISTINGS_ERROR = 'app/SearchPage/SEARCH_LISTINGS_ERROR';

// Sponsored / boosted band — runs as a parallel query alongside the main
// search so the "pay to be up top" band is visually separate from the
// earned-trust cluster. See src/util/listingBoost.js for the design
// rationale (paid placement and social proof are two different axes).
export const SEARCH_BOOSTED_SUCCESS = 'app/SearchPage/SEARCH_BOOSTED_SUCCESS';
export const SEARCH_BOOSTED_ERROR = 'app/SearchPage/SEARCH_BOOSTED_ERROR';

export const SEARCH_MAP_LISTINGS_REQUEST = 'app/SearchPage/SEARCH_MAP_LISTINGS_REQUEST';
export const SEARCH_MAP_LISTINGS_SUCCESS = 'app/SearchPage/SEARCH_MAP_LISTINGS_SUCCESS';
export const SEARCH_MAP_LISTINGS_ERROR = 'app/SearchPage/SEARCH_MAP_LISTINGS_ERROR';

export const SEARCH_MAP_SET_ACTIVE_LISTING = 'app/SearchPage/SEARCH_MAP_SET_ACTIVE_LISTING';

// ================ Reducer ================ //

const initialState = {
  pagination: null,
  searchParams: null,
  searchInProgress: false,
  searchListingsError: null,
  currentPageResultIds: [],
  // Boosted result IDs live in a separate bucket so the UI can render a
  // dedicated Sponsored band above the organic results.
  boostedResultIds: [],
  boostedError: null,
};

const resultIds = (data) => {
  const listings = data.data;
  return listings
    .filter((l) => !l.attributes.deleted && l.attributes.state === 'published')
    .map((l) => l.id);
};

const listingPageReducer = (state = initialState, action = {}) => {
  const { type, payload } = action;
  switch (type) {
    case SEARCH_LISTINGS_REQUEST:
      return {
        ...state,
        searchParams: payload.searchParams,
        searchInProgress: !isEqual(state.searchParams, payload.searchParams),
        searchMapListingIds: [],
        searchListingsError: null,
      };
    case SEARCH_LISTINGS_SUCCESS:
      return {
        ...state,
        currentPageResultIds: resultIds(payload.data),
        pagination: payload.data.meta,
        searchInProgress: false,
      };
    case SEARCH_LISTINGS_ERROR:
      // eslint-disable-next-line no-console
      console.error(payload);
      return { ...state, searchInProgress: false, searchListingsError: payload };

    case SEARCH_BOOSTED_SUCCESS:
      return {
        ...state,
        boostedResultIds: resultIds(payload.data),
        boostedError: null,
      };
    case SEARCH_BOOSTED_ERROR:
      // Boost failures are non-blocking — log and move on. A missing
      // Sponsored band is never worse than a broken search page.
      // eslint-disable-next-line no-console
      console.warn('[SearchPage] boosted query failed:', payload);
      return { ...state, boostedResultIds: [], boostedError: payload };

    case SEARCH_MAP_SET_ACTIVE_LISTING:
      return {
        ...state,
        activeListingId: payload,
      };
    default:
      return state;
  }
};

export default listingPageReducer;

// ================ Action creators ================ //

export const searchListingsRequest = (searchParams) => ({
  type: SEARCH_LISTINGS_REQUEST,
  payload: { searchParams },
});

export const searchListingsSuccess = (response) => ({
  type: SEARCH_LISTINGS_SUCCESS,
  payload: { data: response.data },
});

export const searchListingsError = (e) => ({
  type: SEARCH_LISTINGS_ERROR,
  error: true,
  payload: e,
});

export const searchBoostedSuccess = (response) => ({
  type: SEARCH_BOOSTED_SUCCESS,
  payload: { data: response.data },
});

export const searchBoostedError = (e) => ({
  type: SEARCH_BOOSTED_ERROR,
  error: true,
  payload: e,
});

export const searchListings = (searchParams, config) => (dispatch, getState, sdk) => {
  dispatch(searchListingsRequest(searchParams));

  // SearchPage can enforce listing query to only those listings with valid listingType
  // NOTE: this only works if you have set 'enum' type search schema to listing's public data fields
  //       - listingType
  //       Same setup could be expanded to 2 other extended data fields:
  //       - transactionProcessAlias
  //       - unitType
  //       ...and then turned enforceValidListingType config to true in configListing.js
  // Read More:
  // https://www.sharetribe.com/docs/how-to/manage-search-schemas-with-flex-cli/#adding-listing-search-schemas
  const searchValidListingTypes = (listingTypes, listingTypePathParam, isListingTypeVariant) => {
    return isListingTypeVariant
      ? {
          pub_listingType: listingTypePathParam,
        }
      : config.listing.enforceValidListingType
      ? {
          pub_listingType: listingTypes.map((l) => l.listingType),
          // pub_transactionProcessAlias: listingTypes.map(l => l.transactionType.alias),
          // pub_unitType: listingTypes.map(l => l.transactionType.unitType),
        }
      : {};
  };

  const omitInvalidCategoryParams = (params) => {
    const categoryConfig = config.search.defaultFilters?.find((f) => f.schemaType === 'category');
    const { categories } = config.categoryConfiguration;
    const { key: prefix, scope } = categoryConfig || {};
    const categoryParamPrefix = constructQueryParamName(prefix, scope);

    const validURLParamForCategoryData = (prefix, categories, level, params) => {
      const levelKey = `${categoryParamPrefix}${level}`;
      const levelValue =
        typeof params?.[levelKey] !== 'undefined' ? `${params?.[levelKey]}` : undefined;
      const foundCategory = categories.find(cat => cat.id === levelValue);
      const subcategories = foundCategory?.subcategories || [];
      return foundCategory && subcategories.length > 0
        ? {
            [levelKey]: levelValue,
            ...validURLParamForCategoryData(prefix, subcategories, level + 1, params),
          }
        : foundCategory
          ? { [levelKey]: levelValue }
          : {};
    };

    const categoryKeys = validURLParamForCategoryData(prefix, categories, 1, params);
    const nonCategoryKeys = Object.entries(params).reduce(
      (picked, [k, v]) => (k.startsWith(categoryParamPrefix) ? picked : { ...picked, [k]: v }),
      {}
    );

    return { ...nonCategoryKeys, ...categoryKeys };
  };

  const priceSearchParams = (priceParam) => {
    const inSubunits = (value) => convertUnitToSubUnit(value, unitDivisor(config.currency));
    const values = priceParam ? priceParam.split(',') : [];
    return priceParam && values.length === 2
      ? {
          price: [inSubunits(values[0]), inSubunits(values[1]) + 1].join(','),
        }
      : {};
  };

  const datesSearchParams = (datesParam) => {
    const searchTZ = 'Etc/UTC';
    const datesFilter = config.search.defaultFilters.find((f) => f.key === 'dates');
    const values = datesParam ? datesParam.split(',') : [];
    const hasValues = datesFilter && datesParam && values.length === 2;
    const { dateRangeMode, availability } = datesFilter || {};
    const isNightlyMode = dateRangeMode === 'night';
    const isEntireRangeAvailable = availability === 'time-full';

    // SearchPage need to use a single time zone but listings can have different time zones
    // We need to expand/prolong the time window (start & end) to cover other time zones too.
    //
    // NOTE: you might want to consider changing UI so that
    //   1) location is always asked first before date range
    //   2) use some 3rd party service to convert location to time zone (IANA tz name)
    //   3) Make exact dates filtering against that specific time zone
    //   This setup would be better for dates filter,
    //   but it enforces a UX where location is always asked first and therefore configurability
    const getProlongedStart = (date) => subtractTime(date, 14, 'hours', searchTZ);
    const getProlongedEnd = (date) => addTime(date, 12, 'hours', searchTZ);

    const startDate = hasValues ? parseDateFromISO8601(values[0], searchTZ) : null;
    const endRaw = hasValues ? parseDateFromISO8601(values[1], searchTZ) : null;
    const endDate =
      hasValues && isNightlyMode
        ? endRaw
        : hasValues
          ? getExclusiveEndDate(endRaw, searchTZ)
          : null;

    const today = getStartOf(new Date(), 'day', searchTZ);
    const possibleStartDate = subtractTime(today, 14, 'hours', searchTZ);
    const hasValidDates =
      hasValues &&
      startDate.getTime() >= possibleStartDate.getTime() &&
      startDate.getTime() <= endDate.getTime();

    const dayCount = isEntireRangeAvailable ? daysBetween(startDate, endDate) : 1;
    const day = 1440;
    const hour = 60;
    // When entire range is required to be available, we count minutes of included date range,
    // but there's a need to subtract one hour due to possibility of daylight saving time.
    // If partial range is needed, then we just make sure that the shortest time unit supported
    // is available within the range.
    // You might want to customize this to match with your time units (e.g. day: 1440 - 60)
    const minDuration = isEntireRangeAvailable ? dayCount * day - hour : hour;
    return hasValidDates
      ? {
          start: getProlongedStart(startDate),
          end: getProlongedEnd(endDate),
          // Availability can be time-full or time-partial.
          // However, due to prolonged time window, we need to use time-partial.
          availability: 'time-partial',
          // minDuration uses minutes
          minDuration,
        }
      : {};
  };

  const stockFilters = (datesMaybe) => {
    const hasDatesFilterInUse = Object.keys(datesMaybe).length > 0;

    // If dates filter is not in use,
    //   1) Add minStock filter with default value (1)
    //   2) Add relaxed stockMode: "match-undefined"
    // The latter is used to filter out all the listings that explicitly are out of stock,
    // but keeps bookable and inquiry listings.
    return hasDatesFilterInUse ? {} : { minStock: 1, stockMode: 'match-undefined' };
  };

  const seatsSearchParams = (seats, datesMaybe) => {
    const seatsFilter = config.search.defaultFilters.find(f => f.key === 'seats');
    const hasDatesFilterInUse = Object.keys(datesMaybe).length > 0;

    // Seats filter cannot be applied without dates
    return hasDatesFilterInUse && seatsFilter ? { seats } : {};
  };

  const {
    perPage,
    price,
    dates,
    seats,
    sort,
    mapSearch,
    listingTypePathParam,
    isListingTypeVariant,
    ...restOfParams
  } = searchParams;
  const priceMaybe = priceSearchParams(price);
  const datesMaybe = datesSearchParams(dates);
  const stockMaybe = stockFilters(datesMaybe);
  const seatsMaybe = seatsSearchParams(seats, datesMaybe);
  // 'distance' is not a valid Marketplace API sort value: the API sorts by
  // distance when 'origin' is sent without 'sort', and returns 400 if both
  // are sent ("'sort' can not be used in combination with 'origin'").
  const isImplicitSort =
    sort === config.search.sortConfig.relevanceKey || sort === SORT_BY_DISTANCE;
  const sortMaybe = isImplicitSort ? {} : { sort };

  const params = {
    // The rest of the params except invalid nested category-related params
    // Note: invalid independent search params are still passed through
    ...omitInvalidCategoryParams(restOfParams),
    // If the search page variant is of type /s/:listingType, this sets the pub_listingType
    // query parameter to the value of the listing type path parameter. The ordering matters here,
    // since this value overrides any possible pub_listingType value coming from query parameters
    // i.e. the previous row.
    //
    // Only one value is currently supported in pub_listingType – if you want to support e.g.
    // /s/:listingType?pub_listingType=[otherListingType] => pub_listingType=listingType,otherListingType,
    // you'll need to customize a logic that merges the query param and path param values.
    ...searchValidListingTypes(
      config.listing.listingTypes,
      listingTypePathParam,
      isListingTypeVariant
    ),
    ...priceMaybe,
    ...datesMaybe,
    ...stockMaybe,
    ...seatsMaybe,
    ...sortMaybe,
    perPage,
  };

  // Parallel Sponsored query. Same filters as the organic search, but with
  // `pub_boostActive: true` to pull only listings with an active paid boost.
  // Runs in parallel (not chained) so Sponsored loads as fast as the main
  // results — and if it errors, the organic search is unaffected.
  // Capped at 6 results — more than that starts to feel like an ad farm.
  const boostedParams = {
    ...params,
    pub_boostActive: true,
    perPage: 6,
    // Sort is intentionally ignored on the boosted query — the Sponsored
    // band has its own ranking (tier rank + jitter) applied client-side
    // via mergeBoostedResults in src/util/listingBoost.js.
  };

  const boostedQuery = sdk.listings
    .query(boostedParams)
    .then((response) => {
      const listingFields = config?.listing?.listingFields;
      const sanitizeConfig = { listingFields };
      dispatch(addMarketplaceEntities(response, sanitizeConfig));
      dispatch(searchBoostedSuccess(response));
      return response;
    })
    .catch((e) => {
      // Swallow: boost query must never break the main search page.
      dispatch(searchBoostedError(storableError(e)));
      return null;
    });

  const mainQuery = sdk.listings
    .query(params)
    .then((response) => {
      const listingFields = config?.listing?.listingFields;
      const sanitizeConfig = { listingFields };

      dispatch(addMarketplaceEntities(response, sanitizeConfig));
      dispatch(searchListingsSuccess(response));
      return response;
    })
    .catch((e) => {
      const error = storableError(e);
      dispatch(searchListingsError(error));
      if (!(isErrorUserPendingApproval(error) || isForbiddenError(error))) {
        throw e;
      }
    });

  // Return the main query's promise so existing callers (loadData, SSR)
  // still await it. The boosted query runs alongside but is fire-and-forget
  // from the caller's perspective.
  boostedQuery.catch(() => {}); // already handled; silence unhandled rejection
  return mainQuery;
};

export const setActiveListing = (listingId) => ({
  type: SEARCH_MAP_SET_ACTIVE_LISTING,
  payload: listingId,
});

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  // In private marketplace mode, this page won't fetch data if the user is unauthorized
  const { listingType: listingTypePathParam } = params || {};
  const state = getState();
  const currentUser = state.user?.currentUser;
  const isAuthorized = currentUser && isUserAuthorized(currentUser);
  const hasViewingRights = currentUser && hasPermissionToViewData(currentUser);
  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const canFetchData =
    !isPrivateMarketplace || (isPrivateMarketplace && isAuthorized && hasViewingRights);
  if (!canFetchData) {
    return Promise.resolve();
  }

  const queryParams = parse(search, {
    latlng: ['origin'],
    latlngBounds: ['bounds'],
  });

  const { page = 1, address, origin, ...rest } = queryParams;
  const { sort } = rest;

  const originMaybe =
    isOriginInUse(config) && origin && sort === SORT_BY_DISTANCE ? { origin } : {};

  const listingTypeVariantMaybe = listingTypePathParam
    ? { listingTypePathParam, isListingTypeVariant: true }
    : {};

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const aspectRatio = aspectHeight / aspectWidth;

  const searchListingsCall = searchListings(
    {
      ...rest,
      ...originMaybe,
      ...listingTypeVariantMaybe,
      page,
      perPage: RESULT_PAGE_SIZE,
      include: ['author', 'images'],
      'fields.listing': [
        'title',
        'geolocation',
        'price',
        'deleted',
        'state',
        'publicData.listingType',
        'publicData.transactionProcessAlias',
        'publicData.unitType',
        // These help rendering of 'purchase' listings,
        // when transitioning from search page to listing page
        'publicData.pickupEnabled',
        'publicData.shippingEnabled',
        'publicData.location',
        'publicData.priceVariationsEnabled',
        'publicData.priceVariants',
      ],
      'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
      'fields.image': [
        'variants.scaled-small',
        'variants.scaled-medium',
        `variants.${variantPrefix}`,
        `variants.${variantPrefix}-2x`,
      ],
      ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
      ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
      'limit.images': 1,
    },
    config
  );
  return dispatch(searchListingsCall);
};
