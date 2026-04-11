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

/**
 * Per-guest surcharge for pool bookings.
 *
 * Reads the selected price variant from the listing's publicData and the
 * orderData.guestCount sent by the client. If guestCount > includedGuests,
 * adds a `line-item/guest-surcharge` for the excess guests.
 *
 * Expected shape of a priceVariant with guest fields:
 *   {
 *     name: 'Pool Party',
 *     priceInSubunits: 42000,           // $420 base
 *     durationHours: 4,
 *     includedGuests: 12,
 *     extraGuestPriceInSubunits: 2500,  // $25 / extra guest
 *     maxGuests: 20,
 *   }
 */
const getGuestSurchargeLineItems = (priceVariant, orderData, currency) => {
  if (!priceVariant || !orderData) return [];
  const guestCount = Number(orderData.guestCount) || 0;
  const included = Number(priceVariant.includedGuests) || 0;
  const extraPriceSubunits = Number(priceVariant.extraGuestPriceInSubunits) || 0;
  const extras = Math.max(0, guestCount - included);
  if (extras === 0 || extraPriceSubunits === 0) return [];
  return [
    {
      code: 'line-item/guest-surcharge',
      unitPrice: new Money(extraPriceSubunits, currency),
      quantity: extras,
      includeFor: ['customer', 'provider'],
    },
  ];
};

/**
 * Apply a dynamic pricing surge multiplier to the unit price.
 *
 * Reads listing.attributes.publicData.dynamicPricing.surgeMultiplier.
 * If absent or 1, returns the base price unchanged. Otherwise multiplies
 * the unit subunits by the factor (rounded to nearest subunit).
 *
 * The multiplier is normally written by a nightly cron that reads market
 * supply/demand signals. Hosts can opt-out by not enabling dynamic pricing.
 */
const applyDynamicPricingMultiplier = (basePrice, listing) => {
  const { dynamicPricing } = listing.attributes.publicData || {};
  const surge = Number(dynamicPricing?.surgeMultiplier);
  if (!surge || surge === 1) return basePrice;
  const surged = Math.round(basePrice.amount * surge);
  return new Money(surged, basePrice.currency);
};

/**
 * Flat cleaning fee declared on the listing. Appears as a separate line item.
 *
 * Expected shape:
 *   listing.attributes.publicData.cleaningFee = {
 *     amount: 4000,
 *     currency: 'USD',
 *   }
 */
const getCleaningFeeLineItem = listing => {
  const { cleaningFee = {} } = listing.attributes.publicData || {};
  const { amount, currency } = cleaningFee;
  if (!Number.isInteger(amount) || amount <= 0 || !currency) return [];
  return [
    {
      code: 'line-item/cleaning-fee',
      unitPrice: new Money(amount, currency),
      quantity: 1,
      includeFor: ['customer', 'provider'],
    },
  ];
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
  const publicData = listing.attributes.publicData;
  // Note: the unitType needs to be one of the following:
  // day, night, hour, fixed, or item (these are related to payment processes)
  const { unitType, priceVariants, priceVariationsEnabled } = publicData;

  const isBookable = ['day', 'night', 'hour', 'fixed'].includes(unitType);
  const priceAttribute = listing.attributes.price;
  const currency = priceAttribute.currency;

  const { priceVariantName } = orderData || {};
  const priceVariantConfig = priceVariants
    ? priceVariants.find(pv => pv.name === priceVariantName)
    : null;
  const { priceInSubunits } = priceVariantConfig || {};
  const isPriceInSubunitsValid = Number.isInteger(priceInSubunits) && priceInSubunits >= 0;

  const baseUnitPrice =
    isBookable && priceVariationsEnabled && isPriceInSubunitsValid
      ? new Money(priceInSubunits, currency)
      : priceAttribute;

  // Apply dynamic pricing multiplier (from nightly market snapshot).
  // No-op when surgeMultiplier is absent or 1.
  const unitPrice = applyDynamicPricingMultiplier(baseUnitPrice, listing);

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
  const guestSurchargeLineItemsMaybe = getGuestSurchargeLineItems(
    priceVariantConfig,
    orderData,
    currency
  );
  const cleaningFeeLineItemMaybe = getCleaningFeeLineItem(listing);

  // Commissions are computed off the revenue-generating line items:
  // base order + amenities + guest surcharge + cleaning fee.
  // Refundable deposit is excluded — it's held and returned, not earned.
  const commissionableItems = [
    order,
    ...amenityLineItemsMaybe,
    ...guestSurchargeLineItemsMaybe,
    ...cleaningFeeLineItemMaybe,
  ];

  const providerCommissionMaybe = hasCommissionPercentage(providerCommission)
    ? [
        {
          code: 'line-item/provider-commission',
          unitPrice: calculateTotalFromLineItems(commissionableItems),
          percentage: getNegation(providerCommission.percentage),
          includeFor: ['provider'],
        },
      ]
    : [];
  const customerCommissionMaybe = hasCommissionPercentage(customerCommission)
    ? [
        {
          code: 'line-item/customer-commission',
          unitPrice: calculateTotalFromLineItems(commissionableItems),
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
    ...guestSurchargeLineItemsMaybe,
    ...cleaningFeeLineItemMaybe,
    ...providerCommissionMaybe,
    ...customerCommissionMaybe,
    ...refundableDepositLineItemMaybe,
    ...amenityLineItemsMaybe,
  ];

  return lineItems;
};
