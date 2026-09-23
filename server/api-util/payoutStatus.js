// Payout account status, derived only from what Stripe actually reports.
//
// The payouts dashboard used to warn "Your payout account needs a bit more
// information" whenever `payouts_enabled` was not true — including when the
// account could not be read at all. The server's restricted Stripe key lacks
// connected-account read permission, every read returned 403, and all 105
// hosts with a Stripe account saw the warning while their payouts were paying.
// An API permission failure is not a host compliance problem, so it gets its
// own state and no warning.
//
//   'enabled'          Stripe reports payouts on and nothing due now.
//   'action_required'  Stripe reports payouts off, a disabled_reason, or
//                      requirements currently/past due.
//   'unknown'          The account could not be read. Say nothing about it.

const accountStatus = account => {
  if (!account || typeof account !== 'object') return 'unknown';
  const req = account.requirements || {};
  const due = list => Array.isArray(list) && list.length > 0;
  if (
    account.payouts_enabled !== true ||
    req.disabled_reason ||
    due(req.currently_due) ||
    due(req.past_due)
  ) {
    return 'action_required';
  }
  return 'enabled';
};

// The status-related fields of the summary response. Unknown stays null, never
// a guessed false or [].
const statusFields = account => {
  const status = accountStatus(account);
  if (status === 'unknown') {
    return {
      accountStatus: status,
      payoutsEnabled: null,
      chargesEnabled: null,
      requirementsCurrentlyDue: null,
      requirementsPastDue: null,
      disabledReason: null,
    };
  }
  const req = account.requirements || {};
  return {
    accountStatus: status,
    payoutsEnabled: account.payouts_enabled === true,
    chargesEnabled: account.charges_enabled === true,
    requirementsCurrentlyDue: req.currently_due || [],
    requirementsPastDue: req.past_due || [],
    disabledReason: req.disabled_reason || null,
  };
};

module.exports = { accountStatus, statusFields };
