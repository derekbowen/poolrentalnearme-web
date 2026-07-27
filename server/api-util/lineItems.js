const {
  calculateQuantityFromDates,
  calculateQuantityFromHours,
  calculateTotalFromLineItems,
  calculateShippingFee,
  hasCommissionPercentage,
  LINE_ITEM_AMENITY,
  LINE_ITEM_REFUNDABLE_DEPOSIT,
} = require('./lineItemHelpers');
const { types } = require('sharetribe-flex-sdk');
const { Money } = types;

/**
 * Get quantity and add extra line-items that are related to delivery method
 *
 * @param {Object} orderData should contain stockReservationQuantity and deliveryMethod
 * @param {*} publicData should contain shipping prices
 * @param {*} currency should point to the currency of listing's price.
 */
const getItemQuantityAndLineItems = (orderData, publicData, currency) => {
  // Check delivery method and shipping prices
  const quantity = orderData ? orderData.stockReservationQuantity : null;
  const deliveryMethod = orderData && orderData.deliveryMethod;
  const isShipping = deliveryMethod === 'shipping';
  const isPickup = deliveryMethod === 'pickup';
  const { shippingPriceInSubunitsOneItem, shippingPriceInSubunitsAdditionalItems } =
    publicData || {};

  // Calculate shipping fee if applicable
  const shippingFee = isShipping
    ? calculateShippingFee(
        shippingPriceInSubunitsOneItem,
        shippingPriceInSubunitsAdditionalItems,
        currency,
        quantity
      )
    : null;

  // Add line-item for given delivery method.
  // Note: by default, pickup considered as free.
  const deliveryLineItem = !!shippingFee
    ? [
        {
          code: 'line-item/shipping-fee',
          unitPrice: shippingFee,
          quantity: 1,
          includeFor: ['customer', 'provider'],
        },
      ]
    : isPickup
      ? [
          {
            code: 'line-item/pickup-fee',
            unitPrice: new Money(0, currency),
            quantity: 1,
            includeFor: ['customer', 'provider'],
          },
        ]
      : [];

  return { quantity, extraLineItems: deliveryLineItem };
};

/**
 * Get quantity for fixed bookings with seats.
 * @param {Object} orderData
 * @param {number} [orderData.seats]
 */
const getFixedQuantityAndLineItems = orderData => {
  const { seats } = orderData || {};
  const hasSeats = !!seats;
  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 1 session x 2 seats (aka unit price is multiplied by 2)
  return hasSeats ? { units: 1, seats, extraLineItems: [] } : { quantity: 1, extraLineItems: [] };
};

/**
 * Get quantity for arbitrary units for time-based bookings.
 *
 * @param {Object} orderData
 * @param {string} orderData.bookingStart
 * @param {string} orderData.bookingEnd
 * @param {number} [orderData.seats]
 */
const getHourQuantityAndLineItems = orderData => {
  const { bookingStart, bookingEnd, seats } = orderData || {};
  const hasSeats = !!seats;
  const units =
    bookingStart && bookingEnd ? calculateQuantityFromHours(bookingStart, bookingEnd) : null;

  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 3 hours x 2 seats (aka unit price is multiplied by 6)
  return hasSeats ? { units, seats, extraLineItems: [] } : { quantity: units, extraLineItems: [] };
};

/**
 * Calculate quantity based on days or nights between given bookingDates.
 *
 * @param {Object} orderData
 * @param {string} orderData.bookingStart
 * @param {string} orderData.bookingEnd
 * @param {number} [orderData.seats]
 * @param {'line-item/day' | 'line-item/night'} code
 */
const getDateRangeQuantityAndLineItems = (orderData, code) => {
  const { bookingStart, bookingEnd, seats } = orderData;
  const hasSeats = !!seats;
  const units =
    bookingStart && bookingEnd ? calculateQuantityFromDates(bookingStart, bookingEnd, code) : null;

  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 3 nights x 4 seats (aka unit price is multiplied by 12)
  return hasSeats ? { units, seats, extraLineItems: [] } : { quantity: units, extraLineItems: [] };
};

const getAmenityLineItems = (amenities, listing) => {
  if (!amenities) {
    return [];
  }
  const { amenities: listingAmenities } = listing.attributes.publicData;
  const lineItems = [];
  amenities.forEach((amenity) => {
    const listingAmenity = listingAmenities.find((lAmenity) => lAmenity.id === amenity);
    const { amount, currency } = listingAmenity?.price || {};
    if (listingAmenity?.name && (amount || amount === 0) && currency) {
      lineItems.push({
        code: `${LINE_ITEM_AMENITY}${listingAmenity.id}`,
        unitPrice: new Money(amount, currency),
        quantity: 1,
        includeFor: ['customer', 'provider'],
      });
    }
  });
  return lineItems;
};

const getRefundableDepositLineItem = (listing) => {
  const { refundableDeposit = {} } = listing.attributes.publicData;
  const { amount, currency } = refundableDeposit;
  if ((amount || amount === 0) && currency) {
    return [
      {
        code: LINE_ITEM_REFUNDABLE_DEPOSIT,
        unitPrice: new Money(amount, currency),
        quantity: 1,
        includeFor: ['customer', 'provider'],
      },
    ];
  }
  return [];
};

/**
 * Returns collection of lineItems (max 50)
 *
 * All the line-items dedicated to _customer_ define the "payin total".
 * Similarly, the sum of all the line-items included for _provider_ create "payout total".
 * Platform gets the commission, which is the difference between payin and payout totals.
 *
 * Each line items has following fields:
 * - `code`: string, mandatory, indentifies line item type (e.g. \"line-item/cleaning-fee\"), maximum length 64 characters.
 * - `unitPrice`: money, mandatory
 * - `lineTotal`: money
 * - `quantity`: number
 * - `percentage`: number (e.g. 15.5 for 15.5%)
 * - `seats`: number
 * - `units`: number
 * - `includeFor`: array containing strings \"customer\" or \"provider\", default [\":customer\"  \":provider\" ]
 *
 * Line item must have either `quantity` or `percentage` or both `seats` and `units`.
 *
 * `includeFor` defines commissions. Customer commission is added by defining `includeFor` array `["customer"]` and provider commission by `["provider"]`.
 *
 * @param {Object} listing
 * @param {Object} orderData
 * @param {Object} providerCommission
 * @param {Object} customerCommission
 * @returns {Array} lineItems
 */
exports.transactionLineItems = (listing, orderData, providerCommission, customerCommission) => {
  // Normalize booking window shape. The listing page sends {bookingStart, bookingEnd}
  // at the top level, but the checkout/post-login handoff (and stored sessionStorage
  // data) nests them under {bookingDates: {bookingStart, bookingEnd}}. Without this,
  // the nested shape yields zero units -> HTTP 400 and the guest cannot book.
  // Backward-compatible: only fills top-level fields when they are absent.
  if (orderData && orderData.bookingDates && !orderData.bookingStart && !orderData.bookingEnd) {
    orderData = {
      ...orderData,
      bookingStart: orderData.bookingDates.bookingStart,
      bookingEnd: orderData.bookingDates.bookingEnd,
    };
  }
  const publicData = listing.attributes.publicData;
  // Note: the unitType needs to be one of the following:
  // day, night, hour, fixed, or item (these are related to payment processes)
  const { unitType, priceVariants, priceVariationsEnabled } = publicData;

  const isBookable = ['day', 'night', 'hour', 'fixed'].includes(unitType);
  const priceAttribute = listing.attributes.price;
  const currency = priceAttribute.currency;

  // ─────────────────────────────────────────────────────────────────────────
  // Additional charge (the "host charges more after booking" feature).
  // A separate, payout-safe transaction in the `additional-charge` process for
  // a flat host-requested amount (in subunits). No booking units. The amount is
  // validated server-side in the initiate endpoint against the host's request
  // stored on the original booking, so the guest cannot change what they owe.
  // Early-return: this case never touches the booking unit-pricing below.
  // ─────────────────────────────────────────────────────────────────────────
  const additionalChargeAmount = orderData ? orderData.additionalChargeAmount : null;
  if (Number.isInteger(additionalChargeAmount) && additionalChargeAmount > 0) {
    const addOrder = {
      code: 'line-item/additional-charge',
      unitPrice: new Money(additionalChargeAmount, currency),
      quantity: 1,
      includeFor: ['customer', 'provider'],
    };
    const addProviderCommissionMaybe = hasCommissionPercentage(providerCommission)
      ? [
          {
            code: 'line-item/provider-commission',
            unitPrice: calculateTotalFromLineItems([addOrder]),
            percentage: -1 * providerCommission.percentage,
            includeFor: ['provider'],
          },
        ]
      : [];
    const addCustomerCommissionMaybe = hasCommissionPercentage(customerCommission)
      ? [
          {
            code: 'line-item/customer-commission',
            unitPrice: calculateTotalFromLineItems([addOrder]),
            percentage: customerCommission.percentage,
            includeFor: ['customer'],
          },
        ]
      : [];
    return [addOrder, ...addProviderCommissionMaybe, ...addCustomerCommissionMaybe];
  }

  // ── Enforce host booking rules (min/max hours + advance notice) ──
  // The wizard collects these into publicData.availability.{minHours,maxHours,
  // advanceNoticeDays} (and a flattened copy on publicData). Enforce them
  // server-side so an out-of-range booking is rejected at price-preview AND
  // checkout. No-op when a listing has no rules set → zero impact on existing
  // listings. (Buffer needs adjacent-booking data; enforced separately.)
  const bookingRules = publicData.availability || {};
  // Robust numeric read: the wizard has saved these as strings in the past, and
  // Number.isInteger silently disabled enforcement for those listings.
  const ruleVal = key => {
    const raw = publicData[key] != null ? publicData[key] : bookingRules[key];
    const n = typeof raw === 'string' ? parseFloat(raw) : raw;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const minHours = ruleVal('minHours');
  const maxHours = ruleVal('maxHours');
  const advanceNoticeDays = ruleVal('advanceNoticeDays');
  const advanceNoticeHours = ruleVal('advanceNoticeHours');
  const ruleError = msg => {
    const e = new Error(msg);
    e.status = 400;
    e.statusText = msg;
    e.data = {};
    return e;
  };
  if (isBookable && orderData && orderData.bookingStart && orderData.bookingEnd) {
    const startMs = new Date(orderData.bookingStart).getTime();
    const endMs = new Date(orderData.bookingEnd).getTime();
    const hours = (endMs - startMs) / (1000 * 60 * 60);
    if (Number.isFinite(hours) && hours > 0) {
      if (minHours && hours < minHours) {
        throw ruleError(`This pool has a ${minHours}-hour minimum booking.`);
      }
      if (maxHours && hours > maxHours) {
        throw ruleError(`This pool allows up to ${maxHours} hours per booking.`);
      }
    }
    // Universal floor, independent of any host rule: a booking can never start
    // in the past. Defense-in-depth alongside Sharetribe's own validation, with
    // a human-readable error instead of a raw API failure.
    if (Number.isFinite(startMs) && startMs < Date.now()) {
      throw ruleError('That start time has already passed \u2014 please pick a time in the future.');
    }
    // advanceNoticeHours (finer-grained) wins over advanceNoticeDays.
    const noticeMs = advanceNoticeHours
      ? advanceNoticeHours * 60 * 60 * 1000
      : advanceNoticeDays
      ? advanceNoticeDays * 24 * 60 * 60 * 1000
      : null;
    if (noticeMs && Number.isFinite(startMs) && startMs < Date.now() + noticeMs) {
      const label = advanceNoticeHours
        ? `${advanceNoticeHours} hour${advanceNoticeHours > 1 ? 's' : ''}`
        : `${advanceNoticeDays} day${advanceNoticeDays > 1 ? 's' : ''}`;
      const tz =
        (listing.attributes.availabilityPlan &&
          listing.attributes.availabilityPlan.timezone) ||
        'Etc/UTC';
      const earliestStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(Date.now() + noticeMs));
      throw ruleError(
        `This pool requires ${label} advance notice \u2014 the earliest available date is ${earliestStr}.`
      );
    }
  }

  const { priceVariantName } = orderData || {};
  const priceVariantConfig = priceVariants
    ? priceVariants.find(pv => pv.name === priceVariantName)
    : null;
  const { priceInSubunits } = priceVariantConfig || {};
  const isPriceInSubunitsValid = Number.isInteger(priceInSubunits) && priceInSubunits >= 0;

  // Per-date custom pricing (Swimply calendar): if the booked date has an
  // override in publicData.availability.dateOverrides, that hourly rate wins.
  const dateOverrides =
    (publicData.availability && publicData.availability.dateOverrides) || {};
  const listingTimeZone =
    (listing.attributes.availabilityPlan && listing.attributes.availabilityPlan.timezone) ||
    'Etc/UTC';
  const overrideBookingStart = orderData && orderData.bookingStart ? orderData.bookingStart : null;
  const bookedDateKey =
    isBookable && overrideBookingStart
      ? new Intl.DateTimeFormat('en-CA', { timeZone: listingTimeZone }).format(
          new Date(overrideBookingStart)
        )
      : null;
  const dateOverride = bookedDateKey ? dateOverrides[bookedDateKey] : null;
  const overridePriceInSubunits =
    dateOverride && Number.isInteger(dateOverride.pricePerHour) && dateOverride.pricePerHour >= 0
      ? dateOverride.pricePerHour
      : null;

  const unitPrice =
    overridePriceInSubunits != null
      ? new Money(overridePriceInSubunits, currency)
      : isBookable && priceVariationsEnabled && isPriceInSubunitsValid
      ? new Money(priceInSubunits, currency)
      : priceAttribute;

  /**
   * Pricing starts with order's base price:
   * Listing's price is related to a single unit. It needs to be multiplied by quantity
   *
   * Initial line-item needs therefore:
   * - code (based on unitType)
   * - unitPrice
   * - quantity
   * - includedFor
   */

  const code = `line-item/${unitType}`;

  // Here "extra line-items" means line-items that are tied to unit type
  // E.g. by default, "shipping-fee" is tied to 'item' aka buying products.
  const quantityAndExtraLineItems =
    unitType === 'item'
      ? getItemQuantityAndLineItems(orderData, publicData, currency)
      : unitType === 'fixed'
      ? getFixedQuantityAndLineItems(orderData)
      : unitType === 'hour'
        ? getHourQuantityAndLineItems(orderData)
        : ['day', 'night'].includes(unitType)
          ? getDateRangeQuantityAndLineItems(orderData, code)
          : {};

  const { quantity, units, seats, extraLineItems } = quantityAndExtraLineItems;

  // Throw error if there is no quantity information given
  if (!quantity && !(units && seats)) {
    const missingFields = [];

    if (!quantity) missingFields.push('quantity');
    if (!units) missingFields.push('units');
    if (!seats) missingFields.push('seats');

    const message = `Error: orderData is missing the following information: ${missingFields.join(
      ', '
    )}. Quantity or either units & seats is required.`;

    const error = new Error(message);
    error.status = 400;
    error.statusText = message;
    error.data = {};
    throw error;
  }

  /**
   * If you want to use pre-defined component and translations for printing the lineItems base price for order,
   * you should use one of the codes:
   * line-item/night, line-item/day, line-item/hour or line-item/item.
   *
   * Pre-definded commission components expects line item code to be one of the following:
   * 'line-item/provider-commission', 'line-item/customer-commission'
   *
   * By default OrderBreakdown prints line items inside LineItemUnknownItemsMaybe if the lineItem code is not recognized. */

  const quantityOrSeats = !!units && !!seats ? { units, seats } : { quantity };
  const order = {
    code,
    unitPrice,
    ...quantityOrSeats,
    includeFor: ['customer', 'provider'],
  };

  // Provider commission reduces the amount of money that is paid out to provider.
  // Therefore, the provider commission line-item should have negative effect to the payout total.
  const getNegation = (percentage) => {
    return -1 * percentage;
  };

  // Note: extraLineItems for product selling (aka shipping fee)
  // is not included in either customer or provider commission calculation.

  const refundableDepositLineItemMaybe = getRefundableDepositLineItem(listing);
  const amenityLineItemsMaybe = getAmenityLineItems(orderData.amenities, listing);

  const providerCommissionMaybe = hasCommissionPercentage(providerCommission)
    ? [
        {
          code: 'line-item/provider-commission',
          unitPrice: calculateTotalFromLineItems([order, ...amenityLineItemsMaybe]),
          percentage: getNegation(providerCommission.percentage),
          includeFor: ['provider'],
        },
      ]
    : [];
  const customerCommissionMaybe = hasCommissionPercentage(customerCommission)
    ? [
        {
          code: 'line-item/customer-commission',
          unitPrice: calculateTotalFromLineItems([order, ...amenityLineItemsMaybe]),
          percentage: customerCommission.percentage,
          includeFor: ['customer'],
        },
      ]
    : [];

  // Let's keep the base price (order) as first line item and provider and customer commissions as last.
  // Note: the order matters only if OrderBreakdown component doesn't recognize line-item.
  const lineItems = [
    order,
    ...extraLineItems,
    ...providerCommissionMaybe,
    ...customerCommissionMaybe,
    ...refundableDepositLineItemMaybe,
    ...amenityLineItemsMaybe,
  ];

  return lineItems;
};
