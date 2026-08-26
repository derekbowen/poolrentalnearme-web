const {
  getAmenityLineItemsWithName,
  getAmenityLineItemsWithNameInUnit,
} = require('api-util/lineItemHelpers');
const { transactionLineItems } = require('../api-util/lineItems');
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');
const { partySizeTierConflict } = require('../api-util/guestBands');

module.exports = async (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body;

  const sdk = getSdk(req, res);
  let lineItems = null;

  const listingPromise = () => sdk.listings.show({ id: bodyParams?.params?.listingId });

  try {
    // c191: hosts could not tell who was booking - profile displayName is
    // guest-chosen and is often a nickname ("Kay", "Sneakers 82", "THE").
    // Resolve the real name SERVER-SIDE from the authenticated caller so the
    // client can never spoof it. Fail soft: a booking must never break because
    // this lookup failed.
    const currentUserPromise = () => sdk.currentUser.show().catch(() => null);

    const [showListingResponse, fetchAssetsResponse, currentUserResponse] = await Promise.all([
      listingPromise(),
      fetchCommission(sdk),
      currentUserPromise(),
    ]);

    const guestProfile = currentUserResponse?.data?.data?.attributes?.profile;
    const guestFirstName = guestProfile?.firstName || null;
    const guestLastName = guestProfile?.lastName || null;
    // Name only. Phone and email are deliberately NOT copied here: guests and
    // hosts communicate through the in-platform message thread.
    const guestIdentityMaybe =
      guestFirstName || guestLastName
        ? {
            guestFirstName,
            guestLastName,
            guestNameSource: 'account-profile',
          }
        : {};

    const listing = showListingResponse.data.data;
    const commissionAsset = fetchAssetsResponse.data.data[0];

    // c192: on listings whose price tiers carry structured guest bands, a
    // stated party size must land inside the tier being paid for. Hosts price
    // bigger groups higher; refuse "12 guests on the 1-5 tier" instead of
    // letting the cheaper price through.
    const tierConflict = partySizeTierConflict(listing, bodyParams?.params);
    if (tierConflict) {
      res.status(400).json({ error: tierConflict });
      return;
    }

    const { saleInfo } = listing?.attributes?.metadata ?? {};

    const { providerCommission, customerCommission } =
      commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

    lineItems = transactionLineItems(
      listing,
      { ...orderData, ...bodyParams.params },
      providerCommission,
      customerCommission
    );

    const trustedSdk = await getTrustedSdk(req);

    const { params } = bodyParams;
    // c151: the promo code is an INPUT to our pricing, not a Sharetribe param.
    // Strip it from what we forward to their API (an unknown key could 400 a
    // real booking) and keep it on protectedData for host visibility/audit.
    const promoCodeUsed =
      (params && params.promoCode) || (orderData && orderData.promoCode) || null;
    if (params && 'promoCode' in params) {
      delete params.promoCode;
    }
    const promoAppliedSubunits = (lineItems || [])
      .filter((li) => li.code === 'line-item/promo-discount')
      .reduce((t, li) => t + Math.abs(li.unitPrice.amount * (li.quantity || 1)), 0);
    const promoProtectedMaybe =
      promoCodeUsed && promoAppliedSubunits > 0
        ? {
            promoCodeUsed: String(promoCodeUsed).toUpperCase(),
            promoDiscountSubunits: promoAppliedSubunits,
          }
        : {};

    const amenityLineItems = getAmenityLineItemsWithName(lineItems, listing);
    const amenityLineItemsInUnit = getAmenityLineItemsWithNameInUnit(lineItems, listing);

    // Add lineItems to the body params
    const body = {
      ...bodyParams,
      params: {
        ...params,
        protectedData: {
          ...(params.protectedData ?? {}),
          ...promoProtectedMaybe,
          ...guestIdentityMaybe,
          amenityLineItems,
          amenityLineItemsInUnit,
          saleInfo,
        },
        lineItems,
      },
    };

    let apiResponse = null;

    if (isSpeculative) {
      apiResponse = await trustedSdk.transactions.initiateSpeculative(body, queryParams);
    } else {
      apiResponse = await trustedSdk.transactions.initiate(body, queryParams);
    }
    const { status, statusText, data } = apiResponse;
    res
      .status(status)
      .set('Content-Type', 'application/transit+json')
      .send(
        serialize({
          status,
          statusText,
          data,
        })
      )
      .end();
  } catch (e) {
    handleError(res, e);
  }
};
