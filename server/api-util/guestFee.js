// The guest booking fee as whole cents, computed per base line.
//
// Why per line: the listing page shows every guest-facing price all-in
// (host price + 15%, rounded half-up — util/currency.js priceWithBookingFee).
// When the fee was one percentage line on the whole subtotal, the guest's total
// was round(15% x (hours + add-ons)), which can differ by a cent from the
// all-in prices the page showed. Rounding the fee on each base line (the hours
// line and each add-on) makes an add-on shown at $11.50 add exactly $11.50.
//
// Why whole cents (quantity 1): Sharetribe then does no rounding of its own,
// so the total our server previews is, by construction, what Sharetribe
// charges. Same form as api/accept-deal.js. The percentage is unchanged.
const Decimal = require('decimal.js');

// Fee on one line total (subunits), rounded half-up — the same rule as the
// client's priceWithBookingFee.
const feeSubunits = (lineTotalSubunits, percentage) =>
  new Decimal(lineTotalSubunits)
    .times(percentage)
    .dividedBy(100)
    .toNearest(1, Decimal.ROUND_HALF_UP)
    .toNumber();

const guestFeeSubunits = (baseLineTotals, percentage) =>
  baseLineTotals.reduce((total, amount) => total + feeSubunits(amount, percentage), 0);

module.exports = { feeSubunits, guestFeeSubunits };
