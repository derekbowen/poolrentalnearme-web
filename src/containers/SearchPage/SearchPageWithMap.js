import classNames from 'classnames';
import debounce from 'lodash/debounce';
import omit from 'lodash/omit';
import { array, arrayOf, bool, func, object } from 'prop-types';
import React, { Component, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import ModalInMobile from 'components/ModalInMobile/ModalInMobile';
import { userLocation } from 'util/maps';
import { SORT_BY_DISTANCE } from 'config/configSearch';
import { getAvailableListingFields } from 'util/configHelpers';
import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';

import { getListingsById } from '../../ducks/marketplaceData.duck';
import { isScrollingDisabled, manageDisableScrolling } from '../../ducks/ui.duck';
import { FormattedMessage, intlShape, useIntl } from '../../util/reactIntl';
import { types as sdkTypes } from '../../util/sdkLoader';
import { createResourceLocatorString, pathByRouteName } from '../../util/routes';
import {
  getQueryParamNames,
  isAnyFilterActive,
  isMainSearchTypeKeywords,
  isOriginInUse,
} from '../../util/search';
import {
  NO_ACCESS_PAGE_USER_PENDING_APPROVAL,
  NO_ACCESS_PAGE_VIEW_LISTINGS,
  parse,
} from '../../util/urlHelpers';
import {
  isErrorNoViewingPermission,
  isErrorUserPendingApproval,
  isForbiddenError,
} from '../../util/errors';
import {
  hasPermissionToViewData,
  isUserAuthorized,
  showCreateListingLinkForUser,
} from '../../util/userHelpers';

import { H3, H5, NamedRedirect, Page } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';

import { setActiveListing } from './SearchPage.duck';
import {
  cleanSearchFromConflictingParams,
  createSearchResultSchema,
  groupListingFieldConfigs,
  initialValues,
  omitLimitedListingFieldParams,
  pickListingFieldFilters,
  searchParamsPicker,
  validFilterParams,
  validUrlQueryParamsFromProps,
  getDatesAndSeatsMaybe,
  getSearchPageResourceLocatorStringParams,
} from './SearchPage.shared';

import FilterComponent from './FilterComponent';
import MainPanelHeader from './MainPanelHeader/MainPanelHeader';
import NoSearchResultsMaybe from './NoSearchResultsMaybe/NoSearchResultsMaybe';
import SearchFiltersMobile from './SearchFiltersMobile/SearchFiltersMobile';
import SearchFiltersPrimary from './SearchFiltersPrimary/SearchFiltersPrimary';
import SearchFiltersSecondary from './SearchFiltersSecondary/SearchFiltersSecondary';
import SearchMap from './SearchMap/SearchMap';
import SearchResultsPanel from './SearchResultsPanel/SearchResultsPanel';
import SortBy from './SortBy/SortBy';

import css from './SearchPageWithMap.module.css';

const MODAL_BREAKPOINT = 768; // Search is in modal on mobile layout
const SEARCH_WITH_MAP_DEBOUNCE = 300; // Little bit of debounce before search is initiated.

// Primary filters have their content in dropdown-popup.
// With this offset we move the dropdown to the left a few pixels on desktop layout.
const FILTER_DROPDOWN_OFFSET = -14;

const getSelectedSecondaryFiltersCount = (
  validQueryParams,
  filterConfigs,
  customSecondaryFilters
) => {
  const hasSecondaryFilters = !!(customSecondaryFilters && customSecondaryFilters.length > 0);
  const potentialSecondaryFilters = hasSecondaryFilters
    ? validFilterParams(validQueryParams, {
        ...filterConfigs,
        listingFieldsConfig: customSecondaryFilters,
      })
    : {};

  const relevantQueryParamNames = customSecondaryFilters.map(f => {
    return f.scope === 'public' ? `pub_${f.key}` : f.key;
  });
  const pickRelevant = name => relevantQueryParamNames.includes(name);
  const selectedSecondaryFilters = Object.keys(potentialSecondaryFilters).filter(pickRelevant);
  return selectedSecondaryFilters?.length;
};

export class SearchPageComponent extends Component {
  constructor(props) {
    super(props);

    this.state = {
      isSearchMapOpenOnMobile: false,
      isMobileModalOpen: false,
      currentQueryParams: validUrlQueryParamsFromProps(props),
      isSecondaryFiltersOpen: false,
    };

    this.onMapMoveEnd = debounce(this.onMapMoveEnd.bind(this), SEARCH_WITH_MAP_DEBOUNCE);
    this.onOpenMobileModal = this.onOpenMobileModal.bind(this);
    this.onCloseMobileModal = this.onCloseMobileModal.bind(this);

    // Filter functions
    this.applyFilters = this.applyFilters.bind(this);
    this.cancelFilters = this.cancelFilters.bind(this);
    this.resetAll = this.resetAll.bind(this);
    this.getHandleChangedValueFn = this.getHandleChangedValueFn.bind(this);

    // SortBy
    this.handleSortBy = this.handleSortBy.bind(this);
  }

  // Callback to determine if new search is needed
  // when map is moved by user or viewport has changed
  onMapMoveEnd(viewportBoundsChanged, data) {
    const { viewportBounds, viewportMapCenter } = data;
    const { params: currentPathParams } = this.props;

    const routes = this.props.routeConfiguration;
    const searchPagePath = currentPathParams.listingType
      ? pathByRouteName('SearchPageWithListingType', routes, currentPathParams)
      : pathByRouteName('SearchPage', routes);
    const currentPath =
      typeof window !== 'undefined' && window.location && window.location.pathname;

    // When using the ReusableMapContainer onMapMoveEnd can fire from other pages than SearchPage too
    const isSearchPage = currentPath === searchPagePath;

    // If mapSearch url param is given
    // or original location search is rendered once,
    // we start to react to "mapmoveend" events by generating new searches
    // (i.e. 'moveend' event in Mapbox and 'bounds_changed' in Google Maps)
    if (viewportBoundsChanged && isSearchPage) {
      const { navigate, location, config, currentLocation } = this.props;
      const listingFieldsConfig = getAvailableListingFields(config);
      const { defaultFilters: defaultFiltersConfig } = config?.search || {};
      const activeListingTypes = config?.listing?.listingTypes.map(config => config.listingType);
      const listingCategories = config.categoryConfiguration.categories;
      const filterConfigs = {
        listingFieldsConfig,
        defaultFiltersConfig,
        listingCategories,
        activeListingTypes,
        currentPathParams,
      };

      // parse query parameters, including a custom attribute named category
      const { address, bounds, mapSearch, ...rest } = parse(location.search, {
        latlng: ['origin'],
        latlngBounds: ['bounds'],
      });
      const { sort } = rest;

      const originMaybe = isOriginInUse(this.props.config)
        ? { origin: sort === SORT_BY_DISTANCE ? currentLocation || viewportMapCenter : viewportMapCenter }
        : {};
      const dropNonFilterParams = false;

      const searchParams = {
        address,
        ...originMaybe,
        bounds: viewportBounds,
        mapSearch: true,
        ...validFilterParams(rest, filterConfigs, dropNonFilterParams),
      };

      const { routeName, pathParams } = getSearchPageResourceLocatorStringParams(routes, location);

      navigate(createResourceLocatorString(routeName, routes, pathParams, searchParams));
    }
  }

  // Invoked when a modal is opened from a child component,
  // for example when a filter modal is opened in mobile view
  onOpenMobileModal() {
    this.setState({ isMobileModalOpen: true });
  }

  // Invoked when a modal is closed from a child component,
  // for example when a filter modal is opened in mobile view
  onCloseMobileModal() {
    this.setState({ isMobileModalOpen: false });
  }

  // Apply the filters by redirecting to SearchPage with new filters.
  applyFilters() {
    const { navigate, routeConfiguration, config, params: currentPathParams, location } = this.props;
    const listingFieldsConfig = getAvailableListingFields(config);
    const { defaultFilters: defaultFiltersConfig, sortConfig } = config?.search || {};
    const activeListingTypes = config?.listing?.listingTypes.map(config => config.listingType);
    const listingCategories = config.categoryConfiguration.categories;
    const filterConfigs = {
      listingFieldsConfig,
      defaultFiltersConfig,
      listingCategories,
      activeListingTypes,
      currentPathParams,
    };

    const urlQueryParams = validUrlQueryParamsFromProps(this.props);
    const searchParams = { ...urlQueryParams, ...this.state.currentQueryParams };
    const search = cleanSearchFromConflictingParams(searchParams, filterConfigs, sortConfig);

    const { routeName, pathParams } = getSearchPageResourceLocatorStringParams(
      routeConfiguration,
      location
    );

    navigate(createResourceLocatorString(routeName, routeConfiguration, pathParams, search));
  }

  // Close the filters by clicking cancel, revert to the initial params
  cancelFilters() {
    this.setState({ currentQueryParams: {} });
  }

  // Reset all filter query parameters
  resetAll(e) {
    const { navigate, routeConfiguration, config, location } = this.props;
    const listingFieldsConfig = getAvailableListingFields(config);
    const { defaultFilters: defaultFiltersConfig } = config?.search || {};

    const urlQueryParams = validUrlQueryParamsFromProps(this.props);
    const filterQueryParamNames = getQueryParamNames(listingFieldsConfig, defaultFiltersConfig);

    // Reset state
    this.setState({ currentQueryParams: {} });

    // Reset routing params
    const queryParams = omit(urlQueryParams, filterQueryParamNames);

    const { routeName, pathParams } = getSearchPageResourceLocatorStringParams(
      routeConfiguration,
      location
    );

    navigate(
      createResourceLocatorString(routeName, routeConfiguration, pathParams, queryParams)
    );
  }

  getHandleChangedValueFn(useHistoryPush) {
    const {
      navigate,
      routeConfiguration,
      config,
      location,
      params: currentPathParams = {},
    } = this.props;
    const listingFieldsConfig = getAvailableListingFields(config);
    const { defaultFilters: defaultFiltersConfig, sortConfig } = config?.search || {};
    const activeListingTypes = config?.listing?.listingTypes.map(config => config.listingType);
    const listingCategories = config.categoryConfiguration.categories;
    const filterConfigs = {
      listingFieldsConfig,
      defaultFiltersConfig,
      listingCategories,
      activeListingTypes,
      currentPathParams,
    };

    const urlQueryParams = validUrlQueryParamsFromProps(this.props);

    return (updatedURLParams) => {
      const updater = (prevState) => {
        const { address, bounds, keywords } = urlQueryParams;
        const mergedQueryParams = { ...urlQueryParams, ...prevState.currentQueryParams };

        // Address and bounds are handled outside of MainPanel.
        // I.e. TopbarSearchForm && search by moving the map.
        // We should always trust urlQueryParams with those.
        // The same applies to keywords, if the main search type is keyword search.
        const keywordsMaybe = isMainSearchTypeKeywords(config) ? { keywords } : {};

        const datesAndSeatsMaybe = getDatesAndSeatsMaybe(mergedQueryParams, updatedURLParams);

        return {
          currentQueryParams: omitLimitedListingFieldParams(
            {
              ...mergedQueryParams,
              ...updatedURLParams,
              ...keywordsMaybe,
              ...datesAndSeatsMaybe,
              address,
              bounds,
            },
            filterConfigs
          ),
        };
      };

      const callback = () => {
        if (useHistoryPush) {
          const searchParams = this.state.currentQueryParams;
          const search = cleanSearchFromConflictingParams(searchParams, filterConfigs, sortConfig);

          const { routeName, pathParams } = getSearchPageResourceLocatorStringParams(
            routeConfiguration,
            location
          );

          navigate(
            createResourceLocatorString(routeName, routeConfiguration, pathParams, search)
          );
        }
      };

      this.setState(updater, callback);
    };
  }

  handleSortBy(urlParam, values) {
    const { navigate, routeConfiguration, currentLocation } = this.props;
    const urlQueryParams = validUrlQueryParamsFromProps(this.props);

    if (values === SORT_BY_DISTANCE) {
      // Distance sort needs an origin. Prefer the user's shared geolocation; if it's
      // not available, fall back to the center of the currently-viewed map area so
      // "Closest first" still actually sorts (previously it no-op'd without geo).
      const b = urlQueryParams.bounds;
      const distanceOrigin =
        currentLocation ||
        (b && b.ne && b.sw
          ? new sdkTypes.LatLng((b.ne.lat + b.sw.lat) / 2, (b.ne.lng + b.sw.lng) / 2)
          : null);
      const originParam = distanceOrigin ? { origin: distanceOrigin } : {};
      // Closest distance means nearest to the origin, period. Drop the map
      // viewport bounds so sparse regions (no pools inside the visible box)
      // still show the nearest listings instead of an empty page.
      const { bounds, address, mapSearch, ...restParams } = urlQueryParams;
      const queryParams = { ...restParams, [urlParam]: values, ...originParam };
      navigate(createResourceLocatorString('SearchPage', routeConfiguration, {}, queryParams));
    } else {
      const { origin, ...rest } = urlQueryParams;
      const queryParams = values ? { ...rest, [urlParam]: values } : omit(urlQueryParams, urlParam);
      navigate(createResourceLocatorString('SearchPage', routeConfiguration, {}, queryParams));
    }
  }

  render() {
    const {
      intl,
      listings = [],
      location,
      onManageDisableScrolling,
      pagination,
      scrollingDisabled,
      searchInProgress,
      searchListingsError,
      searchParams = {},
      activeListingId,
      onActivateListing,
      routeConfiguration,
      config,
      currentLocation,
      params: currentPathParams = {},
      currentUser,
    } = this.props;

    // If the search page variant is of type /s/:listingType, this defines the :listingType
    // path parameter used to filter the whole page.
    //
    // On a default search page (/s), this constant does not have a value, even when a
    // query parameter ?pub_listingType=[queryParamListingType] is used.
    const { listingType: listingTypePathParam } = currentPathParams;

    const { defaultFilters: defaultFiltersRaw, sortConfig } = config?.search || {};
    const listingFields = getAvailableListingFields(config);

    const activeListingTypes = config?.listing?.listingTypes.map(config => config.listingType);
    const defaultFiltersConfig = listingTypePathParam
      ? defaultFiltersRaw.filter(f => f.key !== 'listingType')
      : defaultFiltersRaw;

    const marketplaceCurrency = config.currency;
    const { categoryConfiguration } = config;
    const listingCategories = categoryConfiguration.categories;
    const listingFieldsConfig = pickListingFieldFilters({
      listingFields,
      locationSearch: location.search,
      categoryConfiguration,
      activeListingTypes,
      currentPathParams,
    });
    const filterConfigs = {
      listingFieldsConfig,
      defaultFiltersConfig,
      listingCategories,
      activeListingTypes,
      currentPathParams,
    };

    // Page transition might initially use values from previous search
    // urlQueryParams doesn't contain page specific url params
    // like mapSearch, page or origin (origin depends on config.maps.search.sortSearchByDistance)
    const { searchParamsAreInSync, urlQueryParams, searchParamsInURL } = searchParamsPicker(
      location.search,
      searchParams,
      filterConfigs,
      sortConfig,
      isOriginInUse(config)
    );

    const validQueryParams = urlQueryParams;

    const isWindowDefined = typeof window !== 'undefined';
    const isMobileLayout = isWindowDefined && window.innerWidth < MODAL_BREAKPOINT;
    const shouldShowSearchMap =
      !isMobileLayout || (isMobileLayout && this.state.isSearchMapOpenOnMobile);

    const isKeywordSearch = isMainSearchTypeKeywords(config);
    const builtInPrimaryFilters = defaultFiltersConfig.filter(f =>
      ['categoryLevel', 'listingType'].includes(f.key)
    );
    const builtInFilters = isKeywordSearch
      ? defaultFiltersConfig.filter(
          f => !['keywords', 'categoryLevel', 'listingType'].includes(f.key)
        )
      : defaultFiltersConfig.filter(f => !['categoryLevel', 'listingType'].includes(f.key));
    const [customPrimaryFilters, customSecondaryFilters] = groupListingFieldConfigs(
      listingFieldsConfig,
      activeListingTypes
    );
    const availablePrimaryFilters = [
      ...builtInPrimaryFilters,
      ...customPrimaryFilters,
      ...builtInFilters,
    ];
    const availableFilters = [
      ...builtInPrimaryFilters,
      ...customPrimaryFilters,
      ...builtInFilters,
      ...customSecondaryFilters,
    ];

    const hasSecondaryFilters = !!(customSecondaryFilters && customSecondaryFilters.length > 0);

    // Selected aka active filters
    const selectedFilters = validQueryParams;
    const keysOfSelectedFilters = Object.keys(selectedFilters);
    const selectedFiltersCountForMobile = isKeywordSearch
      ? keysOfSelectedFilters.filter((f) => f !== 'keywords').length
      : keysOfSelectedFilters.length;
    const isValidDatesFilter =
      searchParamsInURL.dates == null ||
      (searchParamsInURL.dates != null && searchParamsInURL.dates === selectedFilters.dates);

    const selectedSecondaryFiltersCount = getSelectedSecondaryFiltersCount(
      validQueryParams,
      filterConfigs,
      customSecondaryFilters
    );

    const isSecondaryFiltersOpen = !!hasSecondaryFilters && this.state.isSecondaryFiltersOpen;
    const propsForSecondaryFiltersToggle = hasSecondaryFilters
      ? {
          isSecondaryFiltersOpen: this.state.isSecondaryFiltersOpen,
          toggleSecondaryFiltersOpen: (isOpen) => {
            this.setState({ isSecondaryFiltersOpen: isOpen, currentQueryParams: {} });
          },
          selectedSecondaryFiltersCount,
        }
      : {};

    const hasPaginationInfo = !!pagination && pagination.totalItems != null;
    const totalItems =
      searchParamsAreInSync && hasPaginationInfo
        ? pagination.totalItems
        : pagination?.paginationUnsupported
          ? listings.length
          : 0;
    const listingsAreLoaded =
      !searchInProgress &&
      searchParamsAreInSync &&
      !!(hasPaginationInfo || pagination?.paginationUnsupported);

    const conflictingFilterActive = isAnyFilterActive(
      sortConfig.conflictingFilters,
      validQueryParams,
      filterConfigs
    );

    const showCreateListingsLink = showCreateListingLinkForUser(config, currentUser);
    const sortBy = mode => {
      return sortConfig.active ? (
        <SortBy
          sort={validQueryParams[sortConfig.queryParamName]}
          isConflictingFilterActive={!!conflictingFilterActive}
          hasConflictingFilters={!!(sortConfig.conflictingFilters?.length > 0)}
          selectedFilters={selectedFilters}
          onSelect={this.handleSortBy}
          showAsPopup
          mode={mode}
          contentPlacementOffset={FILTER_DROPDOWN_OFFSET}
        />
      ) : null;
    };
    const noResultsInfo = (
      <NoSearchResultsMaybe
        listingsAreLoaded={listingsAreLoaded}
        totalItems={totalItems}
        location={location}
        resetAll={this.resetAll}
        showCreateListingsLink={showCreateListingsLink}
      />
    );

    const { bounds, origin } = searchParamsInURL || {};

    // Frame the map to the result listings when the search has no location
    // bounds — otherwise the map defaults to a zoomed-out whole-world view.
    const fitBoundsFromListings = ls => {
      const coords = (ls || [])
        .map(l => l && l.attributes && l.attributes.geolocation)
        .filter(g => g && typeof g.lat === 'number' && typeof g.lng === 'number');
      if (!coords.length) return null;
      const lats = coords.map(c => c.lat);
      const lngs = coords.map(c => c.lng);
      const pad = coords.length === 1 ? 0.4 : 0.08;
      try {
        return new sdkTypes.LatLngBounds(
          new sdkTypes.LatLng(Math.max(...lats) + pad, Math.max(...lngs) + pad),
          new sdkTypes.LatLng(Math.min(...lats) - pad, Math.min(...lngs) - pad)
        );
      } catch (e) {
        return null;
      }
    };
    const mapBounds = bounds || fitBoundsFromListings(listings);
    const { title, description, schema } = createSearchResultSchema(
      listings,
      searchParamsInURL || {},
      intl,
      routeConfiguration,
      config
    );

    // Set topbar class based on if a modal is open in
    // a child component
    const topbarClasses = this.state.isMobileModalOpen
      ? classNames(css.topbarBehindModal, css.topbar)
      : css.topbar;

    // N.B. openMobileMap button is sticky.
    // For some reason, stickyness doesn't work on Safari, if the element is <button>
    return (
      <Page
        scrollingDisabled={scrollingDisabled}
        description={description}
        title={title}
        schema={schema}
        shouldIndex={!location.search}
      >
        <TopbarContainer rootClassName={topbarClasses} currentSearchParams={validQueryParams} />
        <div className={css.container}>
          <div className={css.searchResultContainer}>
            <SearchFiltersMobile
              className={css.searchFiltersMobileMap}
              urlQueryParams={validQueryParams}
              sortByComponent={sortBy('mobile')}
              listingsAreLoaded={listingsAreLoaded}
              resultsCount={totalItems}
              searchInProgress={searchInProgress}
              searchListingsError={searchListingsError}
              showAsModalMaxWidth={MODAL_BREAKPOINT}
              onMapIconClick={() => this.setState({ isSearchMapOpenOnMobile: true })}
              onManageDisableScrolling={onManageDisableScrolling}
              onOpenModal={this.onOpenMobileModal}
              onCloseModal={this.onCloseMobileModal}
              resetAll={this.resetAll}
              selectedFiltersCount={selectedFiltersCountForMobile}
              noResultsInfo={noResultsInfo}
              location={location}
              isMapVariant
              currentLocation={currentLocation}
            >
              {availableFilters.map((filterConfig) => {
                const key = `SearchFiltersMobile.${filterConfig.scope || 'built-in'}.${
                  filterConfig.key
                }`;
                return (
                  <FilterComponent
                    key={key}
                    idPrefix="SearchFiltersMobile"
                    config={filterConfig}
                    listingCategories={listingCategories}
                    marketplaceCurrency={marketplaceCurrency}
                    urlQueryParams={validQueryParams}
                    initialValues={initialValues(this.props, this.state.currentQueryParams)}
                    getHandleChangedValueFn={this.getHandleChangedValueFn}
                    intl={intl}
                    liveEdit
                    showAsPopup={false}
                  />
                );
              })}
            </SearchFiltersMobile>
            <MainPanelHeader
              className={css.mainPanelMapVariant}
              sortByComponent={sortBy('desktop')}
              isSortByActive={sortConfig.active}
              listingsAreLoaded={listingsAreLoaded}
              resultsCount={totalItems}
              searchInProgress={searchInProgress}
              searchListingsError={searchListingsError}
              noResultsInfo={noResultsInfo}
              currentLocation={currentLocation}
              searchAddress={searchParamsInURL?.address}
            >
              <SearchFiltersPrimary {...propsForSecondaryFiltersToggle}>
                {availablePrimaryFilters.map((filterConfig) => {
                  const key = `SearchFiltersPrimary.${filterConfig.scope || 'built-in'}.${
                    filterConfig.key
                  }`;
                  return (
                    <FilterComponent
                      key={key}
                      idPrefix="SearchFiltersPrimary"
                      config={filterConfig}
                      listingCategories={listingCategories}
                      marketplaceCurrency={marketplaceCurrency}
                      urlQueryParams={validQueryParams}
                      initialValues={initialValues(this.props, this.state.currentQueryParams)}
                      getHandleChangedValueFn={this.getHandleChangedValueFn}
                      intl={intl}
                      showAsPopup
                      contentPlacementOffset={FILTER_DROPDOWN_OFFSET}
                    />
                  );
                })}
              </SearchFiltersPrimary>
            </MainPanelHeader>
            {isSecondaryFiltersOpen ? (
              <div className={classNames(css.searchFiltersPanel)}>
                <SearchFiltersSecondary
                  urlQueryParams={validQueryParams}
                  listingsAreLoaded={listingsAreLoaded}
                  applyFilters={this.applyFilters}
                  cancelFilters={this.cancelFilters}
                  resetAll={this.resetAll}
                  onClosePanel={() => this.setState({ isSecondaryFiltersOpen: false })}
                >
                  {customSecondaryFilters.map((filterConfig) => {
                    const key = `SearchFiltersSecondary.${filterConfig.scope || 'built-in'}.${
                      filterConfig.key
                    }`;
                    return (
                      <FilterComponent
                        key={key}
                        idPrefix="SearchFiltersSecondary"
                        config={filterConfig}
                        listingCategories={listingCategories}
                        marketplaceCurrency={marketplaceCurrency}
                        urlQueryParams={validQueryParams}
                        initialValues={initialValues(this.props, this.state.currentQueryParams)}
                        getHandleChangedValueFn={this.getHandleChangedValueFn}
                        intl={intl}
                        showAsPopup={false}
                      />
                    );
                  })}
                </SearchFiltersSecondary>
              </div>
            ) : (
              <div
                className={classNames(css.listingsForMapVariant, {
                  [css.newSearchInProgress]: !(listingsAreLoaded || searchListingsError),
                })}
              >
                {searchListingsError ? (
                  <H3 className={css.error}>
                    <FormattedMessage id="SearchPage.searchError" />
                  </H3>
                ) : null}
                {!isValidDatesFilter ? (
                  <H5>
                    <FormattedMessage id="SearchPage.invalidDatesFilter" />
                  </H5>
                ) : null}
                <SearchResultsPanel
                  className={css.searchListingsPanel}
                  listings={listings}
                  pagination={listingsAreLoaded ? pagination : null}
                  search={parse(location.search)}
                  setActiveListing={onActivateListing}
                  isMapVariant
                  currentLocation={currentLocation}
                  listingTypeParam={listingTypePathParam}
                  searchInProgress={searchInProgress}
                />
              </div>
            )}
          </div>
          <ModalInMobile
            className={css.mapPanel}
            id="SearchPage_map"
            isModalOpenOnMobile={this.state.isSearchMapOpenOnMobile}
            onClose={() => this.setState({ isSearchMapOpenOnMobile: false })}
            showAsModalMaxWidth={MODAL_BREAKPOINT}
            onManageDisableScrolling={onManageDisableScrolling}
          >
            <div className={css.mapWrapper} data-testid="searchMapContainer">
              {shouldShowSearchMap ? (
                <SearchMap
                  reusableContainerClassName={css.map}
                  rootClassName={css.mapRoot}
                  activeListingId={activeListingId}
                  bounds={mapBounds}
                  center={origin}
                  isSearchMapOpenOnMobile={this.state.isSearchMapOpenOnMobile}
                  location={location}
                  listings={listings || []}
                  onMapMoveEnd={this.onMapMoveEnd}
                  onCloseAsModal={() => {
                    onManageDisableScrolling('SearchPage_map', false);
                  }}
                  messages={intl.messages}
                />
              ) : null}
            </div>
          </ModalInMobile>
        </div>
      </Page>
    );
  }
}

/**
 * SearchPage component with map layout
 *
 * @param {Object} props
 * @param {propTypes.uuid} [props.activeListingId] - The active listing ID
 * @param {propTypes.currentUser} [props.currentUser] - The current user
 * @param {Array<propTypes.listing>} [props.listings] - The listings
 * @param {propTypes.pagination} [props.pagination] - The pagination
 * @param {boolean} [props.scrollingDisabled] - Whether the scrolling is disabled
 * @param {boolean} [props.searchInProgress] - Whether the search is in progress
 * @param {propTypes.error} [props.searchListingsError] - The search listings error
 * @param {Object} [props.searchParams] - The search params from the Redux state
 * @param {Function} [props.onActivateListing] - The function to activate a listing
 * @param {Function} [props.onManageDisableScrolling] - The function to manage the disable scrolling
 * @returns {JSX.Element}
 */
const EnhancedSearchPage = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [currentLocation, setCurrentLocation] = useState(null);

  const getCurrentLocation = async () => {
    const userCurrentLocation = await userLocation();
    return userCurrentLocation;
  };

  useEffect(() => {
    getCurrentLocation().then((userCurrentLocation) => {
      setCurrentLocation(userCurrentLocation);
    });
  }, []);

  // Default to the visitor's location on a fresh /s visit (no search yet) so
  // they land on nearby pools + a local map — like Swimply's "Current location".
  // Respects any existing search; falls back silently if geolocation is denied.
  useEffect(() => {
    if (!currentLocation) return;
    const parsed = parse(location.search, { latlng: ['origin'], latlngBounds: ['bounds'] });
    if (parsed.address || parsed.bounds || parsed.keywords) return;
    const lat = currentLocation.lat;
    const lng = currentLocation.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    try {
      // No bounds on purpose: in sparse regions a viewport box around the user
      // is often empty. Origin + distance sort shows the nearest pools however
      // far away they are; the distance pill on each card sets expectations.
      navigate(
        createResourceLocatorString('SearchPage', routeConfiguration, {}, {
          address: 'Current location',
          origin: currentLocation,
          sort: SORT_BY_DISTANCE,
        })
      );
    } catch (e) {
      /* geolocation default is best-effort */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation]);

  const { searchListingsError } = props;
  if (isForbiddenError(searchListingsError)) {
    // This can happen if private marketplace mode is active
    return (
      <NamedRedirect
        name="SignupPage"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  const { currentUser, ...restOfProps } = props;
  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const isUnauthorizedUser = currentUser && !isUserAuthorized(currentUser);
  const hasNoViewingRightsUser = currentUser && !hasPermissionToViewData(currentUser);
  const hasUserPendingApprovalError = isErrorUserPendingApproval(searchListingsError);
  const hasNoViewingRightsError = isErrorNoViewingPermission(searchListingsError);

  if ((isPrivateMarketplace && isUnauthorizedUser) || hasUserPendingApprovalError) {
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_USER_PENDING_APPROVAL }}
      />
    );
  } else if (hasNoViewingRightsUser || hasNoViewingRightsError) {
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_VIEW_LISTINGS }}
      />
    );
  }

  return (
    <SearchPageComponent
      config={config}
      routeConfiguration={routeConfiguration}
      intl={intl}
      navigate={navigate}
      location={location}
      currentLocation={currentLocation}
      currentUser={currentUser}
      params={params}
      {...restOfProps}
    />
  );
};

const mapStateToProps = (state) => {
  const { currentUser } = state.user;
  const {
    currentPageResultIds,
    pagination,
    searchInProgress,
    searchListingsError,
    searchParams,
    activeListingId,
  } = state.SearchPage;
  const listings = getListingsById(state, currentPageResultIds);

  return {
    currentUser,
    listings,
    pagination,
    scrollingDisabled: isScrollingDisabled(state),
    searchInProgress,
    searchListingsError,
    searchParams,
    activeListingId,
  };
};

const mapDispatchToProps = (dispatch) => ({
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
  onActivateListing: (listingId) => dispatch(setActiveListing(listingId)),
});

const SearchPage = connect(mapStateToProps, mapDispatchToProps)(EnhancedSearchPage);

export default SearchPage;
