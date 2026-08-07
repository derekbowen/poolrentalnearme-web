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

module.exports = async (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body;

  const sdk = getSdk(req, res);
  let lineItems = null;

  const listingPromise = () => sdk.listings.show({ id: bodyParams?.params?.listingId });

  try {
    const [showListingResponse, fetchAssetsResponse] = await Promise.all([
      listingPromise(),
      fetchCommission(sdk),
    ]);

    const listing = showListingResponse.data.data;
    const commissionAsset = fetchAssetsResponse.data.data[0];

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
    const promoCodeUsed = (params && params.promoCode) || (orderData && orderData.promoCode) || null;
    if (params && 'promoCode' in params) {
      delete params.promoCode;
    }
    const promoAppliedSubunits = (lineItems || [])
      .filter(li => li.code === 'line-item/promo-discount')
      .reduce((t, li) => t + Math.abs(li.unitPrice.amount * (li.quantity || 1)), 0);
    const promoProtectedMaybe =
      promoCodeUsed && promoAppliedSubunits > 0
        ? { promoCodeUsed: String(promoCodeUsed).toUpperCase(), promoDiscountSubunits: promoAppliedSubunits }
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
