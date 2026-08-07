import React from 'react';
import { FormattedMessage } from '../../util/reactIntl';
import { types as sdkTypes } from '../../util/sdkLoader';
import { createResourceLocatorString, findRouteByRouteName } from '../../util/routes';
import { convertMoneyToNumber, formatMoney } from '../../util/currency';
import { timestampToDate } from '../../util/dates';
import { hasPermissionToInitiateTransactions, isUserAuthorized } from '../../util/userHelpers';
import {
  NO_ACCESS_PAGE_INITIATE_TRANSACTIONS,
  NO_ACCESS_PAGE_USER_PENDING_APPROVAL,
  createSlug,
} from '../../util/urlHelpers';

import { Page, LayoutSingleColumn } from '../../components';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import css from './ListingPage.module.css';

/**
 * This file contains shared functions from each ListingPage variants.
 */

const { UUID, Money } = sdkTypes;

/**
 * Helper to get formattedPrice and priceTitle for SectionHeading component.
 * @param {Money} price listing's price
 * @param {String} marketplaceCurrency currency of the price (e.g. 'USD')
 * @param {Object} intl React Intl instance
 * @returns Object literal containing formattedPrice and priceTitle
 */
export const priceData = (price, marketplaceCurrency, intl) => {
  if (price && price.currency === marketplaceCurrency) {
    const formattedPrice = formatMoney(intl, price);
    return { formattedPrice, priceTitle: formattedPrice };
  } else if (price) {
    return {
      formattedPrice: `(${price.currency})`,
      priceTitle: `Unsupported currency (${price.currency})`,
    };
  }
  return {};
};

/**
 * Converts Money object to number, which is needed for the search schema (for Google etc.)
 *
 * @param {Money} price
 * @returns {Money|null}
 */
export const priceForSchemaMaybe = price => {
  try {
    const schemaPrice = convertMoneyToNumber(price);
    return {
      price: schemaPrice.toFixed(2),
      priceCurrency: price.currency,
    };
  } catch (e) {
    return {};
  }
};

/**
 * Helper to get price variants for schema.
 * @param {Object} price listing's price
 * @param {Array} priceVariants listing's price variants
 * @param {String} currency listing's currency
 * @param {Object} intl React Intl instance
 * @returns Object literal containing price variants for schema
 */
export const priceVariantsForSchemaMaybe = ({ price, priceVariants, currency, intl }) => {
  const validPriceVariants = priceVariants?.filter((v) => v?.priceInSubunits);

  const hasVariantsWithPrice = validPriceVariants?.length > 1;

  const formattedPriceVariants = validPriceVariants?.map((v) => {
    const { priceInSubunits } = v;
    const priceVariantInMoneyType = new Money(priceInSubunits, currency);
    return priceVariantInMoneyType;
  });
  const { minPriceVariant, maxPriceVariant } =
    formattedPriceVariants?.reduce(
      (acc, v) => {
        const currentPriceVariant = v?.amount;
        return {
          minPriceVariant:
            acc?.minPriceVariant?.amount < currentPriceVariant ? acc?.minPriceVariant : v,
          maxPriceVariant:
            acc?.maxPriceVariant?.amount > currentPriceVariant ? acc?.maxPriceVariant : v,
        };
      },
      {
        minPriceVariant: formattedPriceVariants?.[0],
        maxPriceVariant: formattedPriceVariants?.[0],
      }
    ) || {};

  return hasVariantsWithPrice
    ? {
        price: intl.formatMessage(
          { id: 'ListingPage.schemaPriceVariants' },
          {
            minPriceVariant: convertMoneyToNumber(minPriceVariant)?.toFixed(2),
            maxPriceVariant: convertMoneyToNumber(maxPriceVariant)?.toFixed(2),
          }
        ),
        priceCurrency: currency,
      }
    : priceForSchemaMaybe(price);
};

/**
 * Get category's label.
 *
 * @param {Array} categories array of category objects (key & label)
 * @param {String} value selected category value
 * @returns label for the selected value
 */
export const categoryLabel = (categories, value) => {
  const cat = categories.find(c => c.key === value);
  return cat ? cat.label : value;
};

/**
 * Filter listing images with correct custom image variant name.
 * Used for facebook, twitter and page schema images.
 *
 * @param {Listing} listing
 * @param {String} variantName
 * @returns correct image variant specified by variantName parameter.
 */
export const listingImages = (listing, variantName) =>
  (listing.images || [])
    .map(image => {
      const variants = image.attributes.variants;
      const variant = variants ? variants[variantName] : null;

      // deprecated
      // for backwards combatility only
      const sizes = image.attributes.sizes;
      const size = sizes ? sizes.find(i => i.name === variantName) : null;

      return variant || size;
    })
    .filter(variant => variant != null);

/**
 * Derive a privacy-safe "City, ST" label from a full listing address.
 *
 * Hosts store a full street address in publicData.location.address (e.g.
 * "16721 104th Ave NE, Bothell, WA 98011, USA"). We must NEVER surface that
 * exact street address in a shareable link preview / meta description, so this
 * strips it down to just the city and 2-letter state. If the city can't be
 * confidently parsed (e.g. it still looks like a street line), we return only
 * the state, or null — better to omit the location than leak an address.
 *
 * @param {string} address the full address string
 * @returns {string|null} "City, ST", "City", "ST", or null
 */
export const shortLocationLabel = address => {
  if (!address || typeof address !== 'string') {
    return null;
  }
  const countryTokens = ['usa', 'us', 'u.s.', 'u.s.a.', 'united states', 'united states of america'];
  let parts = address
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  // Drop a trailing country token.
  if (parts.length > 1 && countryTokens.includes(parts[parts.length - 1].toLowerCase())) {
    parts = parts.slice(0, -1);
  }
  if (parts.length === 0) {
    return null;
  }
  const last = parts[parts.length - 1];
  const stateMatch = last.match(/\b([A-Z]{2})\b/);
  const state = stateMatch ? stateMatch[1] : null;
  // City is the part before the "ST zip" chunk when we have multiple parts;
  // for a single part like "Austin TX" strip the trailing state code.
  let city =
    parts.length >= 2
      ? parts[parts.length - 2]
      : last.replace(/\s*\b[A-Z]{2}\b.*$/, '').trim();
  // Guard against leaking a street line (starts with a house number).
  if (/^\d/.test(city)) {
    return state || null;
  }
  if (!city) {
    return state || null;
  }
  return state ? `${city}, ${state}` : city;
};

/**
 * Callback for the "contact" button on ListingPage to open inquiry modal.
 *
 * @param {Object} parameters all the info needed to open inquiry modal.
 */
export const handleContactUser = parameters => () => {
  const {
    navigate,
    params,
    currentUser,
    callSetInitialValues,
    location,
    routes,
    setInitialValues,
    setInquiryModalOpen,
  } = parameters;

  if (!currentUser) {
    const state = { from: `${location.pathname}${location.search}${location.hash}` };

    // We need to log in before showing the modal, but first we need to ensure
    // that modal does open when user is redirected back to this listingpage
    callSetInitialValues(setInitialValues, { inquiryModalOpenForListingId: params.id });

    // signup and return back to listingPage.
    navigate(createResourceLocatorString('SignupPage', routes, {}, {}), state);
  } else if (!isUserAuthorized(currentUser)) {
    // A user in pending-approval state can't contact the author (the same applies for a banned user)
    const pathParams = { missingAccessRight: NO_ACCESS_PAGE_USER_PENDING_APPROVAL };
    navigate(createResourceLocatorString('NoAccessPage', routes, pathParams, {}));
  } else if (!hasPermissionToInitiateTransactions(currentUser)) {
    // A user in pending-approval state can't contact the author (the same applies for a banned user)
    const pathParams = { missingAccessRight: NO_ACCESS_PAGE_INITIATE_TRANSACTIONS };
    navigate(createResourceLocatorString('NoAccessPage', routes, pathParams, {}));
  } else {
    setInquiryModalOpen(true);
  }
};

/**
 * Callback for the inquiry modal to submit aka create inquiry transaction on ListingPage.
 * Note: this is for booking and purchase processes. Inquiry process is handled through handleSubmit.
 *
 * @param {Object} parameters all the info needed to create inquiry.
 */
export const handleSubmitInquiry = parameters => values => {
  const { navigate, params, getListing, onSendInquiry, routes, setInquiryModalOpen } = parameters;
  const listingId = new UUID(params.id);
  const listing = getListing(listingId);
  const { message } = values;

  onSendInquiry(listing, message.trim())
    .then(txId => {
      setInquiryModalOpen(false);

      // Redirect to OrderDetailsPage
      navigate(createResourceLocatorString('OrderDetailsPage', routes, { id: txId.uuid }, {}));
    })
    .catch(() => {
      // Ignore, error handling in duck file
    });
};

/**
 * Handle order submit from OrderPanel.
 *
 * @param {Object} parameters all the info needed to redirect user to CheckoutPage.
 */
export const handleSubmit = parameters => values => {
  const {
    navigate,
    params,
    currentUser,
    getListing,
    callSetInitialValues,
    onInitializeCardPaymentData,
    routes,
  } = parameters;
  const listingId = new UUID(params.id);
  const listing = getListing(listingId);

  const {
    bookingDates,
    bookingStartTime,
    bookingEndTime,
    bookingStartDate, // not relevant (omit)
    bookingEndDate, // not relevant (omit)
    priceVariantName, // relevant for bookings
    quantity: quantityRaw,
    seats: seatsRaw,
    partySize: partySizeRaw,
    deliveryMethod,
    amenities,
    ...otherOrderData
  } = values;

  const bookingMaybe = bookingDates
    ? {
        bookingDates: {
          bookingStart: bookingDates.startDate,
          bookingEnd: bookingDates.endDate,
        },
      }
    : bookingStartTime && bookingEndTime
    ? {
        bookingDates: {
          bookingStart: timestampToDate(bookingStartTime),
          bookingEnd: timestampToDate(bookingEndTime),
        },
      }
    : {};
  // priceVariantName is relevant for bookings
  const priceVariantNameMaybe = priceVariantName ? { priceVariantName } : {};
  const quantity = Number.parseInt(quantityRaw, 10);
  const quantityMaybe = Number.isInteger(quantity) ? { quantity } : {};
  const seats = Number.parseInt(seatsRaw, 10);
  const seatsMaybe = Number.isInteger(seats) ? { seats } : {};
  const partySize = Number.parseInt(partySizeRaw, 10);
  const partySizeMaybe = Number.isInteger(partySize) ? { partySize } : {};
  const deliveryMethodMaybe = deliveryMethod ? { deliveryMethod } : {};
  const amenitiesMaybe = amenities ? { amenities } : {};
  const promoCodeMaybe = values.promoCode ? { promoCode: values.promoCode } : {};

  const initialValues = {
    listing,
    orderData: {
      ...bookingMaybe,
      ...priceVariantNameMaybe,
      ...quantityMaybe,
      ...seatsMaybe,
      ...partySizeMaybe,
      ...deliveryMethodMaybe,
      ...otherOrderData,
      ...amenitiesMaybe,
      ...promoCodeMaybe,
    },
    confirmPaymentError: null,
  };

  const saveToSessionStorage = !currentUser;

  // Customize checkout page state with current listing and selected orderData
  const { setInitialValues } = findRouteByRouteName('CheckoutPage', routes);

  callSetInitialValues(setInitialValues, initialValues, saveToSessionStorage);

  // Clear previous Stripe errors from store if there is any
  onInitializeCardPaymentData();

  // Redirect to CheckoutPage
  navigate(
    createResourceLocatorString(
      'CheckoutPage',
      routes,
      { id: listing.id.uuid, slug: createSlug(listing.attributes.title) },
      {}
    )
  );
};

/**
 * Create fallback views for the ListingPage: LoadingPage and ErrorPage.
 * The PlainPage is just a helper for them.
 */
const PlainPage = props => {
  const { title, topbar, scrollingDisabled, children } = props;
  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn topbar={topbar} footer={<FooterContainer />}>
        {children}
      </LayoutSingleColumn>
    </Page>
  );
};

export const ErrorPage = props => {
  const { topbar, scrollingDisabled, invalidListing, intl } = props;
  return (
    <PlainPage
      title={intl.formatMessage({
        id: 'ListingPage.errorLoadingListingTitle',
      })}
      topbar={topbar}
      scrollingDisabled={scrollingDisabled}
    >
      <p className={css.errorText}>
        {invalidListing ? (
          <FormattedMessage id="ListingPage.errorInvalidListingMessage" />
        ) : (
          <FormattedMessage id="ListingPage.errorLoadingListingMessage" />
        )}
      </p>
    </PlainPage>
  );
};

export const LoadingPage = props => {
  const { topbar, scrollingDisabled, intl } = props;
  return (
    <PlainPage
      title={intl.formatMessage({
        id: 'ListingPage.loadingListingTitle',
      })}
      topbar={topbar}
      scrollingDisabled={scrollingDisabled}
    >
      <p className={css.loadingText}>
        <FormattedMessage id="ListingPage.loadingListingMessage" />
      </p>
    </PlainPage>
  );
};
