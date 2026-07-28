import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

// Contexts
import OrderPanel from 'components/OrderPanel/OrderPanel';
import { LISTING_PAGE } from 'config/configRouting';
import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
// Utils
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { LISTING_STATE_PENDING_APPROVAL, LISTING_STATE_CLOSED } from '../../util/types';
import { types as sdkTypes } from '../../util/sdkLoader';
import {
  LISTING_PAGE_DRAFT_VARIANT,
  LISTING_PAGE_PENDING_APPROVAL_VARIANT,
  LISTING_PAGE_PARAM_TYPE_DRAFT,
  LISTING_PAGE_PARAM_TYPE_EDIT,
  createSlug,
  NO_ACCESS_PAGE_USER_PENDING_APPROVAL,
  NO_ACCESS_PAGE_VIEW_LISTINGS,
} from '../../util/urlHelpers';
import {
  isErrorNoViewingPermission,
  isErrorUserPendingApproval,
  isForbiddenError,
} from '../../util/errors';
import { hasPermissionToViewData, isUserAuthorized } from '../../util/userHelpers';
import {
  ensureListing,
  ensureOwnListing,
  ensureUser,
  userDisplayNameAsString,
} from '../../util/data';
import { richText } from '../../util/richText';
import { formatMoney } from '../../util/currency';
import {
import { cityStateFromLocation } from '../../util/address';
  isBookingProcess,
  isPurchaseProcess,
  resolveLatestProcessName,
} from '../../transactions/transaction';

// Global ducks (for Redux actions and thunks)
import { getMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { manageDisableScrolling, isScrollingDisabled } from '../../ducks/ui.duck';
import { initializeCardPaymentData } from '../../ducks/stripe.duck';

// Shared components
import {
  H4,
  Page,
  NamedLink,
  NamedRedirect,
  LayoutSingleColumn,
  IconReviewStar,
} from '../../components';

// Related components and modules
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import NotFoundPage from '../NotFoundPage/NotFoundPage';

import {
  sendInquiry,
  setInitialValues,
  fetchTimeSlots,
  fetchTransactionLineItems,
} from './ListingPage.duck';

import {
  LoadingPage,
  ErrorPage,
  priceData,
  listingImages,
  handleContactUser,
  handleSubmitInquiry,
  handleSubmit,
  priceForSchemaMaybe,
} from './ListingPage.shared';
import ActionBarMaybe from './ActionBarMaybe';
import SectionTextMaybe from './SectionTextMaybe';
import SectionReviews from './SectionReviews';
import SectionAuthorMaybe from './SectionAuthorMaybe';
import SectionMapMaybe from './SectionMapMaybe';
import SectionGallery from './SectionGallery';
import CustomListingFields from './CustomListingFields';

import { getTemplateComponent } from '../../templates';
import { mapListingToTemplateProps } from '../../templates/dataMapper';

import css from './ListingPage.module.css';

const MIN_LENGTH_FOR_LONG_WORDS_IN_TITLE = 16;

const { Money, UUID } = sdkTypes;

export const ListingPageComponent = (props) => {
  const [inquiryModalOpen, setInquiryModalOpen] = useState(
    props.inquiryModalOpenForListingId === props.params.id
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    isAuthenticated,
    currentUser,
    getListing,
    getOwnListing,
    intl,
    onManageDisableScrolling,
    params: rawParams,
    location,
    scrollingDisabled,
    showListingError,
    reviews = [],
    fetchReviewsError,
    sendInquiryInProgress,
    sendInquiryError,
    navigate,
    callSetInitialValues,
    onSendInquiry,
    onInitializeCardPaymentData,
    config,
    routeConfiguration,
    showOwnListingsOnly,
    ...restOfProps
  } = props;

  const listingConfig = config.listing;
  const listingId = new UUID(rawParams.id);
  const isVariant = rawParams.variant != null;
  const isPendingApprovalVariant = rawParams.variant === LISTING_PAGE_PENDING_APPROVAL_VARIANT;
  const isDraftVariant = rawParams.variant === LISTING_PAGE_DRAFT_VARIANT;
  const currentListing =
    isPendingApprovalVariant || isDraftVariant || showOwnListingsOnly
      ? ensureOwnListing(getOwnListing(listingId))
      : ensureListing(getListing(listingId));
  const listingSlug = rawParams.slug || createSlug(currentListing.attributes.title || '');
  const params = { slug: listingSlug, ...rawParams };

  const listingPathParamType = isDraftVariant
    ? LISTING_PAGE_PARAM_TYPE_DRAFT
    : LISTING_PAGE_PARAM_TYPE_EDIT;
  const listingTab = isDraftVariant ? 'photos' : 'details';

  const isApproved =
    currentListing.id && currentListing.attributes.state !== LISTING_STATE_PENDING_APPROVAL;

  const pendingIsApproved = isPendingApprovalVariant && isApproved;

  // If a /pending-approval URL is shared, the UI requires
  // authentication and attempts to fetch the listing from own
  // listings. This will fail with 403 Forbidden if the author is
  // another user. We use this information to try to fetch the
  // public listing.
  const pendingOtherUsersListing =
    (isPendingApprovalVariant || isDraftVariant) &&
    showListingError &&
    showListingError.status === 403;
  const shouldShowPublicListingPage = pendingIsApproved || pendingOtherUsersListing;

  if (shouldShowPublicListingPage) {
    return <NamedRedirect name="ListingPage" params={params} search={location.search} />;
  }

  const topbar = <TopbarContainer />;

  if (showListingError && showListingError.status === 404) {
    // 404 listing not found
    return <NotFoundPage staticContext={props.staticContext} />;
  }
  if (showListingError) {
    // Other error in fetching listing
    return <ErrorPage topbar={topbar} scrollingDisabled={scrollingDisabled} intl={intl} />;
  }
  if (!currentListing.id) {
    // Still loading the listing
    return <LoadingPage topbar={topbar} scrollingDisabled={scrollingDisabled} intl={intl} />;
  }

  const {
    description = '',
    geolocation = null,
    price = null,
    title = '',
    publicData = {},
    metadata = {},
  } = currentListing.attributes;

  const richTitle = (
    <span>
      {richText(title, {
        longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS_IN_TITLE,
        longWordClass: css.longWord,
      })}
    </span>
  );

  const authorAvailable = currentListing && currentListing.author;
  const userAndListingAuthorAvailable = !!(currentUser && authorAvailable);
  const isOwnListing =
    userAndListingAuthorAvailable && currentListing.author.id.uuid === currentUser.id.uuid;

  const { listingType, transactionProcessAlias, unitType } = publicData;
  if (!(listingType && transactionProcessAlias && unitType)) {
    // Listing should always contain listingType, transactionProcessAlias and unitType)
    return (
      <ErrorPage topbar={topbar} scrollingDisabled={scrollingDisabled} intl={intl} invalidListing />
    );
  }
  const processName = resolveLatestProcessName(transactionProcessAlias.split('/')[0]);
  const isBooking = isBookingProcess(processName);
  const isPurchase = isPurchaseProcess(processName);
  const processType = isBooking ? 'booking' : isPurchase ? 'purchase' : 'inquiry';

  const currentAuthor = authorAvailable ? currentListing.author : null;
  const ensuredAuthor = ensureUser(currentAuthor);
  const noPayoutDetailsSetWithOwnListing =
    isOwnListing && processType !== 'inquiry' && !currentUser?.attributes?.stripeConnected;
  const payoutDetailsWarning = noPayoutDetailsSetWithOwnListing ? (
    <span className={css.payoutDetailsWarning}>
      <FormattedMessage id="ListingPage.payoutDetailsWarning" values={{ processType }} />
      <NamedLink name="StripePayoutPage">
        <FormattedMessage id="ListingPage.payoutDetailsWarningLink" />
      </NamedLink>
    </span>
  ) : null;

  // When user is banned or deleted the listing is also deleted.
  // Because listing can be never showed with banned or deleted user we don't have to provide
  // banned or deleted display names for the function
  const authorDisplayName = userDisplayNameAsString(ensuredAuthor, '');

  const { formattedPrice } = priceData(price, config.currency, intl);

  // Surface a price in the main column: the base price, or the cheapest bookable
  // option as a "From {price}" when multiple price variants exist. This mirrors
  // how OrderPanel resolves publicData.priceVariants.
  const { priceVariants = [], priceVariationsEnabled } = publicData;
  const hasMultiplePriceVariants = !!priceVariationsEnabled && priceVariants.length > 1;
  const cheapestPriceVariant = hasMultiplePriceVariants
    ? priceVariants.reduce(
        (cheapest, current) =>
          current.priceInSubunits < cheapest.priceInSubunits ? current : cheapest,
        priceVariants[0]
      )
    : null;
  let headerFormattedPrice = formattedPrice;
  if (cheapestPriceVariant?.priceInSubunits != null && price) {
    try {
      headerFormattedPrice = formatMoney(
        intl,
        new Money(cheapestPriceVariant.priceInSubunits, price.currency)
      );
    } catch (e) {
      // Fall back to the base price if the variant price can't be formatted
    }
  }

  // Trust signals for the title bar and the booking card: review score when
  // reviews exist, "Hosted since {year}" otherwise — never an empty stars row.
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? Math.round(
          (reviews.reduce((sum, r) => sum + (r?.attributes?.rating || 0), 0) / reviewCount) * 10
        ) / 10
      : null;
  const hostedSince = ensuredAuthor?.attributes?.createdAt
    ? intl.formatDate(ensuredAuthor.attributes.createdAt, { year: 'numeric' })
    : null;
  const trustRow =
    averageRating || hostedSince ? (
      <div className={css.trustRow}>
        {averageRating ? (
          <>
            <IconReviewStar rootClassName={css.trustStar} isFilled />
            <span className={css.trustRating}>{averageRating}</span>
            <span className={css.trustReviewCount}>
              <FormattedMessage id="ListingPage.trustReviewCount" values={{ count: reviewCount }} />
            </span>
          </>
        ) : (
          <span className={css.trustHostedSince}>
            <FormattedMessage id="ListingPage.trustHostedSince" values={{ joined: hostedSince }} />
          </span>
        )}
      </div>
    ) : null;

  const commonParams = { params, navigate, routes: routeConfiguration };
  const onContactUser = handleContactUser({
    ...commonParams,
    currentUser,
    callSetInitialValues,
    location,
    setInitialValues,
    setInquiryModalOpen,
  });
  // Note: this is for inquiry state in booking and purchase processes. Inquiry process is handled through handleSubmit.
  const onSubmitInquiry = handleSubmitInquiry({
    ...commonParams,
    getListing,
    onSendInquiry,
    setInquiryModalOpen,
  });
  const onSubmit = handleSubmit({
    ...commonParams,
    currentUser,
    callSetInitialValues,
    getListing,
    onInitializeCardPaymentData,
  });

  const handleOrderSubmit = (values) => {
    const isCurrentlyClosed = currentListing.attributes.state === LISTING_STATE_CLOSED;
    if (isOwnListing || isCurrentlyClosed) {
      window.scrollTo(0, 0);
    } else {
      onSubmit(values);
    }
  };

  const facebookImages = listingImages(currentListing, 'facebook');
  const twitterImages = listingImages(currentListing, 'twitter');
  const schemaImages = listingImages(
    currentListing,
    `${config.layout.listingImage.variantPrefix}-2x`
  ).map((img) => img.url);
  const { marketplaceName } = config;

  // Build geo-aware title: "Pool Name in Austin, TX | Pool Rental Near Me"
  // publicData carries a city-level label only, so read the structured
  // fields rather than assuming a leading street segment.
  const { city, state } = cityStateFromLocation(publicData?.location);
  const cityState = city && state ? `${city}, ${state}` : city;
  const schemaTitle = cityState
    ? `${title} in ${cityState} | ${marketplaceName}`
    : `${title} | ${marketplaceName}`;

  const productURL = `${config.marketplaceRootURL}${location.pathname}${location.search}${location.hash}`;

  // Geo coordinates for local search ranking
  const geoMaybe = geolocation
    ? { geo: { '@type': 'GeoCoordinates', latitude: geolocation.lat, longitude: geolocation.lng } }
    : {};
  const addressMaybe = locationAddress ? { address: locationAddress } : {};

  return (
    <Page
      title={schemaTitle}
      scrollingDisabled={scrollingDisabled}
      author={authorDisplayName}
      description={description}
      facebookImages={facebookImages}
      twitterImages={twitterImages}
      schema={[
        {
          '@type': 'LodgingBusiness',
          name: title,
          description,
          image: schemaImages,
          url: productURL,
          ...geoMaybe,
          ...addressMaybe,
          offers: {
            '@type': 'Offer',
            url: productURL,
            ...priceForSchemaMaybe(price),
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: config.marketplaceRootURL },
            { '@type': 'ListItem', position: 2, name: 'Search Pools', item: `${config.marketplaceRootURL}/s` },
            { '@type': 'ListItem', position: 3, name: title, item: productURL },
          ],
        },
      ]}
    >
      <LayoutSingleColumn className={css.pageRoot} topbar={topbar} footer={<FooterContainer />}>
        {(() => {
          const listingStyle = publicData.listingStyle;
          const useTemplate = listingStyle && listingStyle !== 'clean';

          const actionBar = mounted && currentListing.id ? (
            <ActionBarMaybe
              className={css.actionBarForProductLayout}
              isOwnListing={isOwnListing}
              listing={currentListing}
              showNoPayoutDetailsSet={noPayoutDetailsSetWithOwnListing}
              currentUser={currentUser}
              editParams={{
                id: listingId.uuid,
                slug: listingSlug,
                type: listingPathParamType,
                tab: listingTab,
              }}
            />
          ) : null;

          const orderPanel = (
            <OrderPanel
              className={css.productOrderPanel}
              listing={currentListing}
              isOwnListing={isOwnListing}
              onSubmit={handleOrderSubmit}
              authorLink={
                <NamedLink
                  className={css.authorNameLink}
                  name={isVariant ? 'ListingPageVariant' : 'ListingPage'}
                  params={params}
                  to={{ hash: '#author' }}
                >
                  {authorDisplayName}
                </NamedLink>
              }
              title={<FormattedMessage id="ListingPage.orderTitle" values={{ title: richTitle }} />}
              titleDesktop={
                <H4 as="h1" className={css.orderPanelTitle}>
                  <FormattedMessage id="ListingPage.orderTitle" values={{ title: richTitle }} />
                </H4>
              }
              payoutDetailsWarning={payoutDetailsWarning}
              trustRow={trustRow}
              author={ensuredAuthor}
              onManageDisableScrolling={onManageDisableScrolling}
              onContactUser={onContactUser}
              {...restOfProps}
              validListingTypes={config.listing.listingTypes}
              marketplaceCurrency={config.currency}
              dayCountAvailableForBooking={config.stripe.dayCountAvailableForBooking}
              marketplaceName={config.marketplaceName}
              currentPage={LISTING_PAGE}
            />
          );

          if (useTemplate) {
            const TemplateComponent = getTemplateComponent(listingStyle);
            const templateProps = mapListingToTemplateProps(
              currentListing,
              ensuredAuthor,
              reviews,
              config,
              intl
            );

            return (
              <>
                {actionBar}
                <TemplateComponent
                  templateProps={templateProps}
                  orderPanel={orderPanel}
                  actionBar={actionBar}
                  onContactUser={onContactUser}
                  isOwnListing={isOwnListing}
                />
              </>
            );
          }

          // Default "clean" layout — existing Sharetribe layout
          return (
            <div className={css.contentWrapperForProductLayout}>
              <div className={css.mainColumnForProductLayout}>
                {actionBar}
                <SectionGallery
                  listing={currentListing}
                  variantPrefix={config.layout.listingImage.variantPrefix}
                />
                <div className={css.mobileHeading}>
                  <H4 as="h1" className={css.orderPanelTitle}>
                    <FormattedMessage id="ListingPage.orderTitle" values={{ title: richTitle }} />
                  </H4>
                </div>
                <div className={css.headerMeta}>
                  {headerFormattedPrice ? (
                    <p className={css.headerPrice}>
                      {hasMultiplePriceVariants ? (
                        <span className={css.headerPriceFrom}>
                          <FormattedMessage id="ListingPage.headerPriceFrom" />
                        </span>
                      ) : null}
                      <span className={css.headerPriceValue}>{headerFormattedPrice}</span>
                      <span className={css.headerPerUnit}>
                        <FormattedMessage id="OrderPanel.perUnit" values={{ unitType }} />
                      </span>
                    </p>
                  ) : null}
                  {trustRow}
                </div>
                <SectionTextMaybe text={description} showAsIngress />

                <CustomListingFields
                  publicData={publicData}
                  metadata={metadata}
                  listingFieldConfigs={listingConfig.listingFields}
                  categoryConfiguration={config.categoryConfiguration}
                  intl={intl}
                />

                <SectionMapMaybe
                  geolocation={geolocation}
                  publicData={publicData}
                  listingId={currentListing.id}
                  mapsConfig={config.maps}
                />
                <SectionReviews reviews={reviews} fetchReviewsError={fetchReviewsError} />
                <SectionAuthorMaybe
                  title={title}
                  listing={currentListing}
                  authorDisplayName={authorDisplayName}
                  onContactUser={onContactUser}
                  isInquiryModalOpen={isAuthenticated && inquiryModalOpen}
                  onCloseInquiryModal={() => setInquiryModalOpen(false)}
                  sendInquiryError={sendInquiryError}
                  sendInquiryInProgress={sendInquiryInProgress}
                  onSubmitInquiry={onSubmitInquiry}
                  currentUser={currentUser}
                  onManageDisableScrolling={onManageDisableScrolling}
                />
              </div>
              <div className={css.orderColumnForProductLayout}>
                {orderPanel}
              </div>
            </div>
          );
        })()}
      </LayoutSingleColumn>
    </Page>
  );
};

/**
 * The ListingPage component with carousel layout.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.params - The path params object
 * @param {string} props.params.id - The listing id
 * @param {string} props.params.slug - The listing slug
 * @param {LISTING_PAGE_DRAFT_VARIANT | LISTING_PAGE_PENDING_APPROVAL_VARIANT} props.params.variant - The listing variant
 * @param {Function} props.onManageDisableScrolling - The on manage disable scrolling function
 * @param {boolean} props.isAuthenticated - Whether the user is authenticated
 * @param {Function} props.getListing - The get listing function
 * @param {Function} props.getOwnListing - The get own listing function
 * @param {Object} props.currentUser - The current user
 * @param {boolean} props.scrollingDisabled - Whether scrolling is disabled
 * @param {string} props.inquiryModalOpenForListingId - The inquiry modal open for the specific listing id
 * @param {propTypes.error} props.showListingError - The show listing error
 * @param {Function} props.callSetInitialValues - The call setInitialValues function, which is given to this function as a parameter
 * @param {Array<propTypes.review>} props.reviews - The reviews
 * @param {propTypes.error} props.fetchReviewsError - The fetch reviews error
 * @param {Object<string, Object>} props.monthlyTimeSlots - The monthly time slots. E.g. { '2019-11': { timeSlots: [], fetchTimeSlotsInProgress: false, fetchTimeSlotsError: null } }
 * @param {Object<string, Object>} props.timeSlotsForDate - The time slots for date. E.g. { '2019-11-01': { timeSlots: [], fetchedAt: 1572566400000, fetchTimeSlotsError: null, fetchTimeSlotsInProgress: false } }
 * @param {boolean} props.sendInquiryInProgress - Whether the send inquiry is in progress
 * @param {propTypes.error} props.sendInquiryError - The send inquiry error
 * @param {Function} props.onSendInquiry - The on send inquiry function
 * @param {Function} props.onInitializeCardPaymentData - The on initialize card payment data function
 * @param {Function} props.onFetchTimeSlots - The on fetch time slots function
 * @param {Function} props.onFetchTransactionLineItems - The on fetch transaction line items function
 * @param {Array<propTypes.transactionLineItem>} props.lineItems - The line items
 * @param {boolean} props.fetchLineItemsInProgress - Whether the fetch line items is in progress
 * @param {propTypes.error} props.fetchLineItemsError - The fetch line items error
 * @returns {JSX.Element} listing page component
 */
const EnhancedListingPage = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const { showListingError, currentUser } = props;
  const isVariant = props.params?.variant != null;
  if (isForbiddenError(showListingError) && !isVariant && !currentUser) {
    // This can happen if private marketplace mode is active
    return (
      <NamedRedirect
        name="SignupPage"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const isUnauthorizedUser = currentUser && !isUserAuthorized(currentUser);
  const hasNoViewingRights = currentUser && !hasPermissionToViewData(currentUser);
  const hasUserPendingApprovalError = isErrorUserPendingApproval(showListingError);

  if ((isPrivateMarketplace && isUnauthorizedUser) || hasUserPendingApprovalError) {
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_USER_PENDING_APPROVAL }}
      />
    );
  } else if (
    (hasNoViewingRights && isForbiddenError(showListingError)) ||
    isErrorNoViewingPermission(showListingError)
  ) {
    // If the user has no viewing rights, fetching anything but their own listings
    // will return a 403 error. If that happens, redirect to NoAccessPage.
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_VIEW_LISTINGS }}
      />
    );
  }

  return (
    <ListingPageComponent
      config={config}
      routeConfiguration={routeConfiguration}
      intl={intl}
      navigate={navigate}
      location={location}
      params={params}
      showOwnListingsOnly={hasNoViewingRights}
      {...props}
    />
  );
};

const mapStateToProps = (state) => {
  const { isAuthenticated } = state.auth;
  const {
    showListingError,
    reviews,
    fetchReviewsError,
    monthlyTimeSlots,
    timeSlotsForDate,
    sendInquiryInProgress,
    sendInquiryError,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    inquiryModalOpenForListingId,
  } = state.ListingPage;
  const { currentUser } = state.user;

  const getListing = (id) => {
    const ref = { id, type: 'listing' };
    const listings = getMarketplaceEntities(state, [ref]);
    return listings.length === 1 ? listings[0] : null;
  };

  const getOwnListing = (id) => {
    const ref = { id, type: 'ownListing' };
    const listings = getMarketplaceEntities(state, [ref]);
    return listings.length === 1 ? listings[0] : null;
  };

  return {
    isAuthenticated,
    currentUser,
    getListing,
    getOwnListing,
    scrollingDisabled: isScrollingDisabled(state),
    inquiryModalOpenForListingId,
    showListingError,
    reviews,
    fetchReviewsError,
    monthlyTimeSlots, // for OrderPanel
    timeSlotsForDate, // for OrderPanel
    lineItems, // for OrderPanel
    fetchLineItemsInProgress, // for OrderPanel
    fetchLineItemsError, // for OrderPanel
    sendInquiryInProgress,
    sendInquiryError,
  };
};

const mapDispatchToProps = (dispatch) => ({
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
  callSetInitialValues: (setInitialValues, values, saveToSessionStorage) =>
    dispatch(setInitialValues(values, saveToSessionStorage)),
  onFetchTransactionLineItems: (params) => dispatch(fetchTransactionLineItems(params)),
  onSendInquiry: (listing, message) => dispatch(sendInquiry(listing, message)),
  onInitializeCardPaymentData: () => dispatch(initializeCardPaymentData()),
  onFetchTimeSlots: (listingId, start, end, timeZone, options) =>
    dispatch(fetchTimeSlots(listingId, start, end, timeZone, options)), // for OrderPanel
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const ListingPage = connect(mapStateToProps, mapDispatchToProps)(EnhancedListingPage);

export default ListingPage;
