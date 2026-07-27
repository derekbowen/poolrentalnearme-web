const { types } = require('sharetribe-flex-sdk');
const { Money, UUID } = types;
const {
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');
const { getDeal } = require('./dealstore');

/**
 * POST /api/accept-deal  (Transit body, privileged)
 *
 * A guest accepts a host "package deal" link. The price is read SERVER-SIDE
 * from the stored deal (by token) — never from the client — so a tampered link
 * cannot change the amount. Builds flat-rate line items (offer-package +
 * commission) exactly like /api/accept-offer, then initiates a FRESH booking
 * straight to pending-payment via the existing privileged request-payment
 * transition. This is thread-independent: it does not touch any old inquiry.
 *
 * bodyParams.params must include: bookingStart, bookingEnd (guest-selected).
 * body must include: dealToken.
 */
module.exports = async (req, res) => {
  const { isSpeculative, dealToken, bodyParams = {}, queryParams } = req.body || {};

  try {
    const deal = await getDeal(dealToken);
    if (!deal) {
      return res.status(404).json({ error: 'This deal link is invalid or has expired.' });
    }

    const sdk = getSdk(req, res);
    const fetchAssetsResponse = await fetchCommission(sdk);

    const { negotiatedPriceCents, currency = 'USD', listingId } = deal;

    const commissionAsset = fetchAssetsResponse.data.data[0];
    const { providerCommission, customerCommission } =
      commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};
    const providerPct = typeof providerCommission?.percentage === 'number' ? providerCommission.percentage : 0;
    const customerPct = typeof customerCommission?.percentage === 'number' ? customerCommission.percentage : 0;
    const providerFee = providerPct > 0 ? Math.round((negotiatedPriceCents * providerPct) / 100) : 0;
    const customerFee = customerPct > 0 ? Math.round((negotiatedPriceCents * customerPct) / 100) : 0;

    const lineItems = [
      {
        code: 'line-item/offer-package',
        unitPrice: new Money(negotiatedPriceCents, currency),
        quantity: 1,
        includeFor: ['customer', 'provider'],
      },
      ...(providerFee > 0
        ? [{ code: 'line-item/provider-commission', unitPrice: new Money(-providerFee, currency), quantity: 1, includeFor: ['provider'] }]
        : []),
      ...(customerFee > 0
        ? [{ code: 'line-item/customer-commission', unitPrice: new Money(customerFee, currency), quantity: 1, includeFor: ['customer'] }]
        : []),
    ];

    const trustedSdk = await getTrustedSdk(req);

    // Strip anything a caller might smuggle in (transition/lineItems/listingId);
    // the server sets all of these from the trusted deal record.
    const { transition: _t, lineItems: _li, listingId: _lid, ...callerParams } = bodyParams.params || {};

    const body = {
      processAlias: 'default-booking/release-1',
      transition: 'transition/request-payment',
      params: {
        ...callerParams, // bookingStart, bookingEnd, protectedData, etc.
        listingId: new UUID(listingId),
        protectedData: {
          ...(callerParams.protectedData || {}),
          packageDeal: true,
          dealToken,
          negotiatedPriceCents,
        },
        lineItems,
      },
    };

    const apiResponse = isSpeculative
      ? await trustedSdk.transactions.initiateSpeculative(body, queryParams)
      : await trustedSdk.transactions.initiate(body, queryParams);

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
