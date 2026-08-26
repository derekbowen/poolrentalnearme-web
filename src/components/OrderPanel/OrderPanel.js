import React from 'react';
import classNames from 'classnames';

import { createSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { LISTING_PAGE } from 'config/configRouting';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import {
  displayDeliveryPickup,
  displayDeliveryShipping,
  displayPrice,
} from '../../util/configHelpers';
import {
  AVAILABILITY_MULTIPLE_SEATS,
  LISTING_STATE_CLOSED,
  LINE_ITEM_NIGHT,
  LINE_ITEM_DAY,
  LINE_ITEM_HOUR,
  LINE_ITEM_FIXED,
  LINE_ITEM_ITEM,
  STOCK_MULTIPLE_ITEMS,
  STOCK_INFINITE_MULTIPLE_ITEMS,
  LISTING_STATE_PUBLISHED,
} from '../../util/types';
import { formatMoney, priceWithBookingFee } from '../../util/currency';
import { types as sdkTypes } from '../../util/sdkLoader';
import { createSlug, parse, stringify } from '../../util/urlHelpers';
import { userDisplayNameAsString } from '../../util/data';
import {
  INQUIRY_PROCESS_NAME,
  getSupportedProcessesInfo,
  isBookingProcess,
  isPurchaseProcess,
  resolveLatestProcessName,
} from '../../transactions/transaction';

import { PrimaryButton, H1, H2, SecondaryButton } from '..';
import { AvatarSmall } from '../Avatar/Avatar';
import ModalInMobile from '../ModalInMobile/ModalInMobile';
import BookingFixedDurationForm from './BookingFixedDurationForm/BookingFixedDurationForm';
import BookingTimeForm from './BookingTimeForm/BookingTimeForm';
import BookingDatesForm from './BookingDatesForm/BookingDatesForm';
import InquiryWithoutPaymentForm from './InquiryWithoutPaymentForm/InquiryWithoutPaymentForm';
import ProductOrderForm from './ProductOrderForm/ProductOrderForm';
import BookmarkButton from '../../extensions/wishlist/components/BookmarkButton/BookmarkButton';
import PriceVariantPicker from './PriceVariantPicker/PriceVariantPicker';
import useMounted from 'hooks/useMounted';

import css from './OrderPanel.module.css';

// This defines when ModalInMobile shows content as Modal
const MODAL_BREAKPOINT = 1023;
const TODAY = new Date();

const { Money } = sdkTypes;

const isPublishedListing = listing => {
  return listing.attributes.state === LISTING_STATE_PUBLISHED;
};

const priceData = (price, currency, intl) => {
  if (price && price.currency === currency) {
    const formattedPrice = formatMoney(intl, price);
    return { formattedPrice, priceTitle: formattedPrice };
  }
  if (price) {
    return {
      formattedPrice: `(${price.currency})`,
      priceTitle: `Unsupported currency (${price.currency})`,
    };
  }
  return {};
};

const getCheapestPriceVariant = (priceVariants = []) => {
  return priceVariants.reduce((cheapest, current) => {
    return current.priceInSubunits < cheapest.priceInSubunits ? current : cheapest;
  }, priceVariants[0]);
};

const formatMoneyIfSupportedCurrency = (price, intl) => {
  try {
    return formatMoney(intl, price);
  } catch (e) {
    return `(${price.currency})`;
  }
};

const openOrderModal = (isOwnListing, isClosed, navigate, location) => {
  if (isOwnListing || isClosed) {
    window.scrollTo(0, 0);
  } else {
    const { pathname, search, state } = location;
    navigate(
      {
        pathname,
        search: createSearchParams({ ...parse(search), orderOpen: true }).toString(),
      },
      {
        replace: false,
        state,
      }
    );
  }
};

const closeOrderModal = (navigate, location) => {
  const { pathname, search, state } = location;
  const searchParams = omit(parse(search), 'orderOpen');
  navigate(
    {
      pathname,
      search: createSearchParams(searchParams).toString(),
    },
    {
      replace: false,
      state,
    }
  );
};

const handleSubmit = (
  isOwnListing,
  isClosed,
  isInquiryWithoutPayment,
  onSubmit,
  navigate,
  location
) => {
  // TODO: currently, inquiry-process does not have any form to ask more order data.
  // We can submit without opening any inquiry/order modal.
  return isInquiryWithoutPayment
    ? () => onSubmit({})
    : () => openOrderModal(isOwnListing, isClosed, navigate, location);
};

const dateFormattingOptions = { month: 'short', day: 'numeric', weekday: 'short' };

const PriceMaybe = (props) => {
  const {
    price,
    publicData,
    validListingTypes,
    intl,
    marketplaceCurrency,
    showCurrencyMismatch = false,
  } = props;
  const { listingType, unitType } = publicData || {};

  const foundListingTypeConfig = validListingTypes.find((conf) => conf.listingType === listingType);
  const showPrice = displayPrice(foundListingTypeConfig);
  const isPriceVariationsInUse = !!publicData?.priceVariationsEnabled;
  const hasMultiplePriceVariants = publicData?.priceVariants?.length > 1;

  if (!showPrice || !price) {
    return null;
  }

  // Display the all-in price (host price + mandatory booking fee) per CA SB 478.
  // NOTE: must NOT be named `displayPrice` — that's an imported configHelpers fn used above.
  // With multiple price variants, surface the cheapest variant as a "From {price}"
  // price instead of hiding the price until an option is picked.
  const showFromPrefix = isPriceVariationsInUse && hasMultiplePriceVariants;
  const cheapestVariant = showFromPrefix ? getCheapestPriceVariant(publicData.priceVariants) : null;
  const baseForDisplay =
    cheapestVariant?.priceInSubunits != null
      ? new Money(cheapestVariant.priceInSubunits, price.currency)
      : price;
  const allInPrice = priceWithBookingFee(baseForDisplay);
  // Get formatted price or currency code if the currency does not match with marketplace currency
  const { formattedPrice, priceTitle } = priceData(allInPrice, marketplaceCurrency, intl);
  const priceValue = (
    <span className={css.priceValue}>{formatMoneyIfSupportedCurrency(allInPrice, intl)}</span>
  );
  const pricePerUnit = (
    <span className={css.perUnit}>
      <FormattedMessage id="OrderPanel.perUnit" values={{ unitType }} />
    </span>
  );

  // TODO: In CTA, we don't have space to show proper error message for a mismatch of marketplace currency
  //       Instead, we show the currency code in place of the price
  return showCurrencyMismatch ? (
    <div className={css.priceContainerInCTA}>
      <div className={css.priceValueInCTA} title={priceTitle}>
        <FormattedMessage
          id={showFromPrefix ? 'OrderPanel.priceFromInMobileCTA' : 'OrderPanel.priceInMobileCTA'}
          values={{ priceValue: formattedPrice }}
        />
      </div>
      <div className={css.perUnitInCTA}>
        <FormattedMessage id="OrderPanel.perUnit" values={{ unitType }} />
      </div>
    </div>
  ) : (
    <div className={css.priceContainer}>
      <p className={css.price}>
        <FormattedMessage
          id={showFromPrefix ? 'OrderPanel.priceFrom' : 'OrderPanel.price'}
          values={{ priceValue, pricePerUnit }}
        />
      </p>
    </div>
  );
};

const PriceMissing = () => {
  return (
    <p className={css.error}>
      <FormattedMessage id="OrderPanel.listingPriceMissing" />
    </p>
  );
};

const InvalidCurrency = () => {
  return (
    <p className={css.error}>
      <FormattedMessage id="OrderPanel.listingCurrencyInvalid" />
    </p>
  );
};

const InvalidPriceVariants = () => {
  return (
    <p className={css.error}>
      <FormattedMessage id="OrderPanel.listingPriceVariantsAreInvalid" />
    </p>
  );
};

const hasUniqueVariants = priceVariants => {
  const priceVariantsSlugs = priceVariants?.map(variant =>
    variant.name ? createSlug(variant.name) : 'no-name'
  );
  return new Set(priceVariantsSlugs).size === priceVariants.length;
};

const hasValidPriceVariants = priceVariants => {
  const isArray = Array.isArray(priceVariants);
  const hasItems = isArray && priceVariants.length > 0;
  const variantsHaveNames = hasItems && priceVariants.every(variant => variant.name);
  const namesAreUnique = hasItems && hasUniqueVariants(priceVariants);

  return variantsHaveNames && namesAreUnique;
};

/**
 * @typedef {Object} ListingTypeConfig
 * @property {string} listingType - The type of the listing
 * @property {string} transactionType - The type of the transaction
 * @property {string} transactionType.process - The process descriptionof the transaction
 * @property {string} transactionType.alias - The alias of the transaction process
 * @property {string} transactionType.unitType - The unit type of the transaction
 */

/**
 * OrderPanel is a component that renders a panel for making bookings, purchases, or inquiries for a listing.
 * It handles different transaction processes and displays appropriate forms based on the listing type.
 *
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overwrites the default class for the root element
 * @param {string} [props.className] - Custom class that extends
 * @param {string} [props.titleClassName] - Custom class name for the title
 * @param {propTypes.listing} props.listing - The listing data (either regular or own listing)
 * @param {Array<ListingTypeConfig>} props.validListingTypes - Array of valid listing type configurations
 * @param {boolean} [props.isOwnListing=false] - Whether the listing belongs to the current user
 * @param {listingType.user|listingType.currentUser} props.author - The listing author's user data
 * @param {ReactNode} [props.authorLink] - Custom component for rendering the author link
 * @param {ReactNode} [props.payoutDetailsWarning] - Warning message about payout details
 * @param {ReactNode} [props.trustRow] - Compact trust row (review score or hosted-since) shown under the price
 * @param {Function} props.onSubmit - Handler for form submission
 * @param {ReactNode|string} props.title - Title of the panel
 * @param {ReactNode} [props.titleDesktop] - Alternative title for desktop view
 * @param {ReactNode|string} [props.subTitle] - Subtitle text
 * @param {Function} props.onManageDisableScrolling - Handler for managing scroll behavior
 * @param {Function} props.onFetchTimeSlots - Handler for fetching available time slots
 * @param {Object} [props.monthlyTimeSlots] - Available time slots by month
 * @param {Function} props.onFetchTransactionLineItems - Handler for fetching transaction line items
 * @param {Function} [props.onContactUser] - Handler for contacting the listing author
 * @param {Array} [props.lineItems] - Array of line items for the transaction
 * @param {boolean} props.fetchLineItemsInProgress - Whether line items are being fetched
 * @param {Object} [props.fetchLineItemsError] - Error object if line items fetch failed
 * @param {string} props.marketplaceCurrency - The currency used in the marketplace
 * @param {number} props.dayCountAvailableForBooking - Number of days available for booking
 * @param {string} props.marketplaceName - Name of the marketplace
 *
 * @returns {JSX.Element} Component that displays the order panel with appropriate form
 */
const OrderPanel = (props) => {
  const {
    rootClassName,
    className,
    titleClassName,
    listing,
    validListingTypes,
    lineItemUnitType: lineItemUnitTypeMaybe,
    isOwnListing,
    onSubmit,
    title,
    titleDesktop,
    author,
    authorLink,
    onManageDisableScrolling,
    onFetchTimeSlots,
    monthlyTimeSlots,
    timeSlotsForDate,
    onFetchTransactionLineItems,
    onContactUser,
    lineItems,
    marketplaceCurrency,
    dayCountAvailableForBooking,
    marketplaceName,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    payoutDetailsWarning,
    currentPage,
    trustRow,
    offerAccept,
  } = props;

  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const mounted = useMounted();

  const publicData = listing?.attributes?.publicData || {};

  // Hosts can require advance notice (publicData.advanceNoticeHours or
  // availability.advanceNoticeDays). Hide time slots inside that window so
  // guests can't pick a start time that checkout would reject anyway.
  const advanceNoticeMs = (() => {
    const rules = publicData.availability || {};
    const num = v => {
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const hours = num(publicData.advanceNoticeHours) || num(rules.advanceNoticeHours);
    const days = num(publicData.advanceNoticeDays) || num(rules.advanceNoticeDays);
    return hours ? hours * 60 * 60 * 1000 : days ? days * 24 * 60 * 60 * 1000 : null;
  })();
  const dropSlotsInsideNotice = slots => {
    if (!advanceNoticeMs || !Array.isArray(slots)) return slots;
    const HOUR_MS = 60 * 60 * 1000;
    const earliest = Math.ceil((Date.now() + advanceNoticeMs) / HOUR_MS) * HOUR_MS;
    return slots
      .filter(ts => new Date(ts.attributes.end).getTime() > earliest)
      .map(ts =>
        new Date(ts.attributes.start).getTime() >= earliest
          ? ts
          : { ...ts, attributes: { ...ts.attributes, start: new Date(earliest) } }
      );
  };
  const noticeAware = collection =>
    !advanceNoticeMs || !collection
      ? collection
      : Object.keys(collection).reduce((acc, k) => {
          const v = collection[k];
          acc[k] = v && v.timeSlots ? { ...v, timeSlots: dropSlotsInsideNotice(v.timeSlots) } : v;
          return acc;
        }, {});
  const noticeAwareMonthlyTimeSlots = noticeAware(monthlyTimeSlots);
  const noticeAwareTimeSlotsForDate = noticeAware(timeSlotsForDate);
  const { listingType, unitType, transactionProcessAlias = '', amenities, priceVariants, startTimeInterval } =
    publicData || {};

  const processName = resolveLatestProcessName(transactionProcessAlias.split('/')[0]);
  const lineItemUnitType = lineItemUnitTypeMaybe || `line-item/${unitType}`;

  const price = listing?.attributes?.price;
  const isPaymentProcess = processName !== INQUIRY_PROCESS_NAME;

  const showPriceMissing = isPaymentProcess && !price;
  const showInvalidCurrency = isPaymentProcess && price?.currency !== marketplaceCurrency;

  const timeZone = listing?.attributes?.availabilityPlan?.timezone;
  const isClosed = listing?.attributes?.state === LISTING_STATE_CLOSED;

  const isBooking = isBookingProcess(processName);
  const shouldHaveFixedBookingDuration = isBooking && [LINE_ITEM_FIXED].includes(lineItemUnitType);
  const showBookingFixedDurationForm =
    mounted && shouldHaveFixedBookingDuration && !isClosed && timeZone && priceVariants?.length > 0;

  const shouldHaveBookingTime = isBooking && [LINE_ITEM_HOUR].includes(lineItemUnitType);
  const showBookingTimeForm = mounted && shouldHaveBookingTime && !isClosed && timeZone;

  const shouldHaveBookingDates =
    isBooking && [LINE_ITEM_DAY, LINE_ITEM_NIGHT].includes(lineItemUnitType);
  const showBookingDatesForm = mounted && shouldHaveBookingDates && !isClosed && timeZone;

  // The listing resource has a relationship: `currentStock`,
  // which you should include when making API calls.
  const isPurchase = isPurchaseProcess(processName);
  const shouldHavePurchase = isPurchase && lineItemUnitType === LINE_ITEM_ITEM;
  const currentStock = listing.currentStock?.attributes?.quantity;
  const isOutOfStock = shouldHavePurchase && !isClosed && currentStock === 0;

  // Show form only when stock is fully loaded. This avoids "Out of stock" UI by
  // default before all data has been downloaded.
  const showProductOrderForm = mounted && isPurchase && typeof currentStock === 'number';

  const showInquiryForm = mounted && processName === INQUIRY_PROCESS_NAME;

  const supportedProcessesInfo = getSupportedProcessesInfo();
  const isKnownProcess = supportedProcessesInfo.map((info) => info.name).includes(processName);

  const { pickupEnabled, shippingEnabled } = listing?.attributes?.publicData || {};

  const listingTypeConfig = validListingTypes.find((conf) => conf.listingType === listingType);
  const displayShipping = displayDeliveryShipping(listingTypeConfig);
  const displayPickup = displayDeliveryPickup(listingTypeConfig);
  const allowOrdersOfMultipleItems = [STOCK_MULTIPLE_ITEMS, STOCK_INFINITE_MULTIPLE_ITEMS].includes(
    listingTypeConfig?.stockType
  );

  const searchParams = parse(location.search);
  const isOrderOpen = !!searchParams.orderOpen;
  const preselectedPriceVariantSlug = searchParams.bookableOption;

  const seatsEnabled = [AVAILABILITY_MULTIPLE_SEATS].includes(listingTypeConfig?.availabilityType);
  // c191: listings store capacity under `guestallowed` (112 of 117 published
  // listings; ZERO use `maxGuests`). Reading only `maxGuests` left this
  // undefined on every listing, so BookingTimeForm's partySizeOptions was always
  // empty and the guest-count selector never rendered for anyone - which is why
  // no transaction has ever carried a partySize. Mirrors the fallback
  // CheckoutPageWithPayment already uses to derive partySizeMax.
  //
  // Only ask when price does NOT already depend on group size. On 62 of 117
  // published listings the price variants ARE the guest bands ("1-5 Guests",
  // "16-20pp"), so a second free-choice guest question would both duplicate the
  // tier and be able to contradict it - pick the "1-5 Guests" rate, then declare
  // 40 guests. Worse, `guestallowed` regularly exceeds the top priced tier
  // (Manasseh Paradise: tiers stop at 30, guestallowed 85), so the selector
  // would offer counts that have no price. Until variants carry structured
  // min/max guests, the tier stays the single source of truth for group size on
  // tiered listings, and we only ask directly where nothing else does.
  const priceIsTieredByGroupSize = (publicData?.priceVariants?.length || 0) > 1;
  const maxGuestsFromPublicData = priceIsTieredByGroupSize
    ? null
    : (publicData?.guestallowed ?? publicData?.maxGuests);

  // Note: publicData contains priceVariationsEnabled if listing is created with priceVariations enabled.
  const isPriceVariationsInUse = !!publicData?.priceVariationsEnabled;
  const preselectedPriceVariant =
    Array.isArray(priceVariants) && preselectedPriceVariantSlug && isPriceVariationsInUse
      ? priceVariants.find(pv => pv?.name && createSlug(pv?.name) === preselectedPriceVariantSlug)
      : null;

  const priceVariantsMaybe = isPriceVariationsInUse
    ? {
        isPriceVariationsInUse,
        priceVariants,
        priceVariantFieldComponent: PriceVariantPicker,
        preselectedPriceVariant,
        isPublishedListing: isPublishedListing(listing),
      }
    : !isPriceVariationsInUse && showBookingFixedDurationForm
    ? {
        isPriceVariationsInUse: false,
        priceVariants: [getCheapestPriceVariant(priceVariants)],
        priceVariantFieldComponent: PriceVariantPicker,
      }
    : {};

  const showInvalidPriceVariantsMessage =
    isPriceVariationsInUse && !hasValidPriceVariants(priceVariants);

  const sharedProps = {
    lineItemUnitType,
    onSubmit,
    price,
    marketplaceCurrency,
    listingId: listing.id,
    isOwnListing,
    marketplaceName,
    onFetchTransactionLineItems,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    payoutDetailsWarning,
    // When present, the guest is accepting a host package deal. The booking
    // form shows this agreed price instead of the hourly estimate.
    offerAccept,
  };

  // Formatted agreed package price for the offer-accept header.
  const offerPriceFormatted =
    offerAccept?.negotiatedPriceCents != null
      ? `$${(offerAccept.negotiatedPriceCents / 100).toFixed(2)}`
      : null;

  const showClosedListingHelpText = listing.id && isClosed;

  const subTitleText = showClosedListingHelpText
    ? intl.formatMessage({ id: 'OrderPanel.subTitleClosedListing' })
    : null;

  const authorDisplayName = userDisplayNameAsString(author, '');

  const classes = classNames(rootClassName || css.root, className);
  const titleClasses = classNames(titleClassName || css.orderTitle);

  return (
    <div className={classes}>
      <ModalInMobile
        containerClassName={css.modalContainer}
        id="OrderFormInModal"
        isModalOpenOnMobile={isOrderOpen}
        onClose={() => closeOrderModal(navigate, location)}
        showAsModalMaxWidth={MODAL_BREAKPOINT}
        onManageDisableScrolling={onManageDisableScrolling}
        usePortal
      >
        <div className={css.modalHeading}>
          <H1 className={css.heading}>{title}</H1>
        </div>

        <div className={css.orderHeading}>
          {titleDesktop || <H2 className={titleClasses}>{title}</H2>}
          {subTitleText ? <div className={css.orderHelp}>{subTitleText}</div> : null}
        </div>

        {offerAccept ? (
          <div
            style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '8px',
              padding: '12px 16px',
              margin: '4px 0 12px',
            }}
          >
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0369a1', margin: 0 }}>
              Your host&apos;s package deal
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#0c4a6e', margin: '2px 0 0' }}>
              {offerPriceFormatted}
            </p>
            <p style={{ fontSize: '12px', color: '#5c6b78', margin: '4px 0 0' }}>
              Pick your date &amp; time below, then continue to payment. Your total is the agreed
              package price above &mdash; not the hourly rate.
            </p>
          </div>
        ) : (
          <PriceMaybe
            price={price}
            publicData={publicData}
            validListingTypes={validListingTypes}
            intl={intl}
            marketplaceCurrency={marketplaceCurrency}
          />
        )}

        {trustRow}

        <div className={css.row}>
          <div className={css.author}>
            <AvatarSmall user={author} className={css.providerAvatar} />
            <span className={css.providerNameLinked}>
              <FormattedMessage id="OrderPanel.author" values={{ name: authorLink }} />
            </span>
            <span className={css.providerNamePlain}>
              <FormattedMessage id="OrderPanel.author" values={{ name: authorDisplayName }} />
            </span>
          </div>
          <BookmarkButton
            listingId={listing.id}
            listingAuthor={author}
            rootClassName={css.bookmarkButton}
          />
        </div>

        {showPriceMissing ? (
          <PriceMissing />
        ) : showInvalidCurrency ? (
          <InvalidCurrency />
        ) : !isKnownProcess || !listingTypeConfig ? (
          <p className={css.errorSidebar}>
            <FormattedMessage id="OrderPanel.unknownTransactionProcess" />
          </p>
        ) : showInvalidPriceVariantsMessage ? (
          <InvalidPriceVariants />
        ) : showBookingFixedDurationForm ? (
          <BookingFixedDurationForm
            seatsEnabled={seatsEnabled}
            className={css.bookingForm}
            formId="OrderPanelBookingFixedDurationForm"
            dayCountAvailableForBooking={dayCountAvailableForBooking}
            monthlyTimeSlots={noticeAwareMonthlyTimeSlots}
            timeSlotsForDate={noticeAwareTimeSlotsForDate}
            onFetchTimeSlots={onFetchTimeSlots}
            startDatePlaceholder={intl.formatDate(TODAY, dateFormattingOptions)}
            startTimeInterval={startTimeInterval}
            timeZone={timeZone}
            {...priceVariantsMaybe}
            {...sharedProps}
          />
        ) : showBookingTimeForm ? (
          <BookingTimeForm
            seatsEnabled={seatsEnabled}
            maxGuests={maxGuestsFromPublicData}
            className={css.bookingForm}
            formId="OrderPanelBookingTimeForm"
            dayCountAvailableForBooking={dayCountAvailableForBooking}
            monthlyTimeSlots={noticeAwareMonthlyTimeSlots}
            timeSlotsForDate={noticeAwareTimeSlotsForDate}
            onFetchTimeSlots={onFetchTimeSlots}
            startDatePlaceholder={intl.formatDate(TODAY, dateFormattingOptions)}
            endDatePlaceholder={intl.formatDate(TODAY, dateFormattingOptions)}
            timeZone={timeZone}
            marketplaceName={marketplaceName}
            onFetchTransactionLineItems={onFetchTransactionLineItems}
            lineItems={lineItems}
            fetchLineItemsInProgress={fetchLineItemsInProgress}
            fetchLineItemsError={fetchLineItemsError}
            payoutDetailsWarning={payoutDetailsWarning}
            amenities={amenities}
            onContactUser={onContactUser}
            listingAuthor={author}
            currentPage={currentPage}
            {...priceVariantsMaybe}
            {...sharedProps}
          />
        ) : showBookingDatesForm ? (
          <BookingDatesForm
            seatsEnabled={seatsEnabled}
            className={css.bookingForm}
            formId="OrderPanelBookingDatesForm"
            dayCountAvailableForBooking={dayCountAvailableForBooking}
            monthlyTimeSlots={noticeAwareMonthlyTimeSlots}
            onFetchTimeSlots={onFetchTimeSlots}
            timeZone={timeZone}
            marketplaceName={marketplaceName}
            onFetchTransactionLineItems={onFetchTransactionLineItems}
            lineItems={lineItems}
            fetchLineItemsInProgress={fetchLineItemsInProgress}
            fetchLineItemsError={fetchLineItemsError}
            payoutDetailsWarning={payoutDetailsWarning}
            amenities={amenities}
            onContactUser={onContactUser}
            listingAuthor={author}
            currentPage={currentPage}
            {...priceVariantsMaybe}
            {...sharedProps}
          />
        ) : showProductOrderForm ? (
          <ProductOrderForm
            formId="OrderPanelProductOrderForm"
            currentStock={currentStock}
            allowOrdersOfMultipleItems={allowOrdersOfMultipleItems}
            pickupEnabled={pickupEnabled && displayPickup}
            shippingEnabled={shippingEnabled && displayShipping}
            displayDeliveryMethod={displayPickup || displayShipping}
            onContactUser={onContactUser}
            lineItems={lineItems}
            fetchLineItemsInProgress={fetchLineItemsInProgress}
            fetchLineItemsError={fetchLineItemsError}
            payoutDetailsWarning={payoutDetailsWarning}
            currentPage={currentPage}
            {...sharedProps}
          />
        ) : showInquiryForm ? (
          <InquiryWithoutPaymentForm formId="OrderPanelInquiryForm" onSubmit={onSubmit} />
        ) : null}
      </ModalInMobile>
      <div className={css.openOrderForm}>
        {offerAccept ? (
          <div style={{ padding: '0 0 8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#0c4a6e' }}>
              {offerPriceFormatted}
            </span>
            <span style={{ fontSize: '13px', color: '#5c6b78', marginLeft: '6px' }}>
              package deal
            </span>
          </div>
        ) : (
          <PriceMaybe
            price={price}
            publicData={publicData}
            validListingTypes={validListingTypes}
            intl={intl}
            marketplaceCurrency={marketplaceCurrency}
            showCurrencyMismatch
          />
        )}

        {isClosed ? (
          <div className={css.closedListingButton}>
            <FormattedMessage id="OrderPanel.closedListingButtonText" />
          </div>
        ) : (
          <div className={css.ctaWrapper}>
            <PrimaryButton
              onClick={handleSubmit(
                isOwnListing,
                isClosed,
                showInquiryForm,
                onSubmit,
                navigate,
                location
              )}
              disabled={isOutOfStock}
            >
              {offerAccept ? (
                'Accept this deal'
              ) : isBooking ? (
                <FormattedMessage id="OrderPanel.ctaButtonMessageBooking" />
              ) : isOutOfStock ? (
                <FormattedMessage id="OrderPanel.ctaButtonMessageNoStock" />
              ) : isPurchase ? (
                <FormattedMessage id="OrderPanel.ctaButtonMessagePurchase" />
              ) : (
                <FormattedMessage id="OrderPanel.ctaButtonMessageInquiry" />
              )}
            </PrimaryButton>
            {currentPage === LISTING_PAGE && isPaymentProcess && !isOwnListing ? (
              <SecondaryButton
                onClick={() => onContactUser(author)}
                type="button"
                className={css.contactButton}
              >
                <FormattedMessage id="UserCard.contactUser" />
              </SecondaryButton>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderPanel;
