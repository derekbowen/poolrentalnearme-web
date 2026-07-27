const { types } = require('sharetribe-flex-sdk');
const { Money } = types;
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');
const { denormalisedResponseEntities } = require('../api-util/data');

/**
 * POST /api/accept-offer  (Transit body, privileged)
 *
 * Customer accepts a provider's package deal offer.
 * Reads the negotiated price from protectedData.pendingOffer, builds flat-rate
 * line items (offer-package + commission), then creates the payment intent.
 * Transitions: state/offer-sent → state/pending-payment
 *
 * bodyParams must include:
 *   id          — transaction UUID
 *   params      — { bookingStart, bookingEnd, ... }
 */
module.exports = async (req, res) => {
  const { isSpeculative, bodyParams, queryParams } = req.body;

  const sdk = getSdk(req, res);

  const txPromise = () =>
    sdk.transactions.show(
      {
        id: bodyParams?.id,
        include: ['listing'],
        'fields.transaction': ['protectedData'],
      },
      { expand: true }
    );

  try {
    const [txResponse, fetchAssetsResponse] = await Promise.all([
      txPromise(),
      fetchCommission(sdk),
    ]);

    const entities = denormalisedResponseEntities(txResponse);
    const tx = txResponse.data.data;
    const { listing } = entities;

    const pendingOffer = tx?.attributes?.protectedData?.pendingOffer;
    if (!pendingOffer?.negotiatedPriceCents) {
      return res.status(400).json({ error: 'No pending offer found on this transaction' });
    }

    const { negotiatedPriceCents, currency = 'USD' } = pendingOffer;

    const commissionAsset = fetchAssetsResponse.data.data[0];
    const { providerCommission, customerCommission } =
      commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

    const providerPct = typeof providerCommission?.percentage === 'number' ? providerCommission.percentage : 0;
    const customerPct = typeof customerCommission?.percentage === 'number' ? customerCommission.percentage : 0;

    const providerFee = providerPct > 0 ? Math.round(negotiatedPriceCents * providerPct / 100) : 0;
    const customerFee = customerPct > 0 ? Math.round(negotiatedPriceCents * customerPct / 100) : 0;

    const lineItems = [
      {
        code: 'line-item/offer-package',
        unitPrice: new Money(negotiatedPriceCents, currency),
        quantity: 1,
        includeFor: ['customer', 'provider'],
      },
      ...(providerFee > 0
        ? [{
            code: 'line-item/provider-commission',
            unitPrice: new Money(-providerFee, currency),
            quantity: 1,
            includeFor: ['provider'],
          }]
        : []),
      ...(customerFee > 0
        ? [{
            code: 'line-item/customer-commission',
            unitPrice: new Money(customerFee, currency),
            quantity: 1,
            includeFor: ['customer'],
          }]
        : []),
    ];

    const trustedSdk = await getTrustedSdk(req);

    // Force the transition server-side and strip anything a caller might have
    // smuggled into params (transition/lineItems). The negotiated line items
    // computed above are the ONLY pricing that reaches the Marketplace API, so
    // a client cannot re-price the offer. Booking params (bookingStart/End) and
    // protectedData from the caller are preserved.
    const { transition: _t, lineItems: _li, ...safeParams } = bodyParams.params || {};
    const body = {
      ...bodyParams,
      transition: 'transition/accept-offer',
      params: {
        ...safeParams,
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
      .send(serialize({ status, statusText, data }))
      .end();
  } catch (e) {
    handleError(res, e);
  }
};
