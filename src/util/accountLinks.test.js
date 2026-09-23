import { paymentTabsFor } from './accountLinks';

// accountLinksVisibility values from the live hosted /users/user-types.json (2026-09-23).
const HOST = { postListings: true, payoutDetails: true, paymentMethods: false }; // "Earn With Your Pool"
const SWIMMER = { postListings: true, payoutDetails: false, paymentMethods: true }; // "Swimmer Account"

describe('paymentTabsFor()', () => {
  it('hosts always get Payment Methods, even with the Console toggle off', () => {
    expect(paymentTabsFor(HOST)).toEqual({ showPayoutDetails: true, showPaymentMethods: true });
  });
  it('guests get Payment Methods and no payout tabs', () => {
    expect(paymentTabsFor(SWIMMER)).toEqual({ showPayoutDetails: false, showPaymentMethods: true });
  });
  it('users without a user type keep both', () => {
    expect(paymentTabsFor(undefined)).toEqual({ showPayoutDetails: true, showPaymentMethods: true });
  });
});
