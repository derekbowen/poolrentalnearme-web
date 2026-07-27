const { transactionLineItems } = require('../api-util/lineItems');
const { getSdk, handleError, serialize, fetchCommission } = require('../api-util/sdk');
const { constructValidLineItems } = require('../api-util/lineItemHelpers');

module.exports = (req, res) => {
  const { isOwnListing, listingId, orderData } = req.body;

  const sdk = getSdk(req, res);

  const listingPromise = () =>
    isOwnListing ? sdk.ownListings.show({ id: listingId }) : sdk.listings.show({ id: listingId });

  Promise.all([listingPromise(), fetchCommission(sdk)])
    .then(([showListingResponse, fetchAssetsResponse]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      const lineItems = transactionLineItems(
        listing,
        orderData,
        providerCommission,
        customerCommission
      );

      // Because we are using returned lineItems directly in this template we need to use the helper function
      // to add some attributes like lineTotal and reversal that Marketplace API also adds to the response.
      const validLineItems = constructValidLineItems(lineItems);

      res
        .status(200)
        .set('Content-Type', 'application/transit+json')
        .send(serialize({ data: validLineItems }))
        .end();
    })
    .catch(e => {
      // TEMP DIAG (remove after root-causing checkout 400s): capture exactly what
      // the booking form sent when pricing fails, so we can see the bad field.
      try {
        const od = orderData || {};
        const bs = od.bookingStart ? new Date(od.bookingStart).toISOString() : null;
        const be = od.bookingEnd ? new Date(od.bookingEnd).toISOString() : null;
        const hrs = bs && be ? (new Date(be) - new Date(bs)) / 3600000 : null;
        console.error(
          "LINEITEMS_400_DIAG",
          JSON.stringify({
            listingId,
            status: e && e.status,
            reason: (e && (e.statusText || e.message)) ? String(e.statusText || e.message).slice(0, 160) : null,
            bookingStart: bs,
            bookingEnd: be,
            durationHours: hrs,
            priceVariantName: od.priceVariantName || null,
            seats: od.seats != null ? od.seats : null,
            quantity: od.quantity != null ? od.quantity : null,
            hasBookingDates: !!od.bookingDates,
          })
        );
      } catch (logErr) {
        console.error("LINEITEMS_400_DIAG log failed", logErr && logErr.message);
      }
      handleError(res, e);
    });
};
