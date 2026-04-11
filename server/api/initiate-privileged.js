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

    const amenityLineItems = getAmenityLineItemsWithName(lineItems, listing);
    const amenityLineItemsInUnit = getAmenityLineItemsWithNameInUnit(lineItems, listing);

    // Add lineItems to the body params
    const body = {
      ...bodyParams,
      params: {
        ...params,
        protectedData: {
          ...(params.protectedData ?? {}),
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
