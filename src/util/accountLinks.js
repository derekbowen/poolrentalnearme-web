// Which account-settings payment tabs a signed-in user sees. Dependency-free so
// it is unit-testable outside the Vite build (see accountLinks.test.js).
//
// Payment Methods (cards used when booking) is shown to every signed-in user,
// whatever the Console's accountLinksVisibility.paymentMethods says: a host
// account can also book pools as a guest. The host user type has it off in
// Console, and the Payouts page used to force it on, so the tab appeared only
// after visiting Payouts. Payouts (Stripe Connect, host earnings) still
// follows the user type.
export const paymentTabsFor = accountLinksVisibility => {
  const { payoutDetails = true } = accountLinksVisibility || {};
  return { showPayoutDetails: payoutDetails, showPaymentMethods: true };
};
