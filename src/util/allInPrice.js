// Guest-facing all-in amount (host price + booking fee) in integer subunits.
// Dependency-free so the server's parity test can import it.
//
// Must equal the server's per-line fee (server/api-util/guestFee.js): the fee
// on one line is round-half-up(amount x 15 / 100). For non-negative integer
// subunits that is floor((amount x 15 + 50) / 100), exact in integer math.
// The same rule as priceWithBookingFee in util/currency.js.
export const GUEST_FEE_PCT = 15;

export const allInSubunits = amount => {
  if (!Number.isInteger(amount) || amount < 0) return amount;
  return amount + Math.floor((amount * GUEST_FEE_PCT + 50) / 100);
};
