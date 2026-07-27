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
const { denormalisedResponseEntities } = require('../api-util/data');

// Offer transitions must NEVER be priced here. This endpoint builds line items
// from the listing's hourly rate + caller-supplied dates, so allowing
// transition/accept-offer through would let a customer accept a package deal at
// 1 hour × hourly price instead of the negotiated offer. accept-offer has a
// dedicated, offer-priced endpoint (/api/accept-offer); the others are
// non-privileged and never belong here. Fail closed.
const BLOCKED_TRANSITIONS = [
  'transition/accept-offer',
  'transition/send-offer',
  'transition/decline-offer',
  'transition/expire-offer',
];

module.exports = async (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body;

  if (bodyParams && BLOCKED_TRANSITIONS.includes(bodyParams.transition)) {
    console.warn('[transition-privileged] REJECTED offer transition', {
      transition: bodyParams.transition,
      txId: bodyParams?.id?.uuid || bodyParams?.id,
    });
    return res
      .status(403)
      .json({ error: 'This transition is not allowed here. Package deals are accepted via /api/accept-offer.' });
  }

  const sdk = getSdk(req, res);
  let lineItems = null;

  const txPromise = () =>
    sdk.transactions.show(
      { id: bodyParams?.id, include: ['listing'], 'fields.transaction': [] },
      {
        expand: true,
      }
    );

  try {
    const [txResponse, fetchAssetsResponse] = await Promise.all([
      txPromise(),
      fetchCommission(sdk),
    ]);
    const { listing } = denormalisedResponseEntities(txResponse);
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

    const { listingId, ...restParams } = bodyParams?.params || {};

    const amenityLineItems = getAmenityLineItemsWithName(lineItems, listing);
    const amenityLineItemsInUnit = getAmenityLineItemsWithNameInUnit(lineItems, listing);

    // Add lineItems to the body params
    const body = {
      ...bodyParams,
      params: {
        ...restParams,
        protectedData: {
          ...(restParams.protectedData ?? {}),
          amenityLineItems,
          amenityLineItemsInUnit,
          saleInfo,
        },
        lineItems,
      },
    };

    let apiResponse = null;

    if (isSpeculative) {
      apiResponse = await trustedSdk.transactions.transitionSpeculative(body, queryParams);
    } else {
      apiResponse = await trustedSdk.transactions.transition(body, queryParams);
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
