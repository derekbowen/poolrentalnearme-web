const { accountStatus, statusFields } = require('./payoutStatus');

const ok = {
  payouts_enabled: true,
  charges_enabled: true,
  requirements: { currently_due: [], past_due: [], eventually_due: ['individual.id_number'], disabled_reason: null },
};

describe('accountStatus()', () => {
  it('unreadable account (403 -> null) is unknown, not "needs information"', () => {
    expect(accountStatus(null)).toBe('unknown');
    expect(accountStatus(undefined)).toBe('unknown');
  });
  it('payouts on and nothing due now is enabled (eventually_due alone is not a warning)', () => {
    expect(accountStatus(ok)).toBe('enabled');
  });
  it('payouts off is action required', () => {
    expect(accountStatus({ ...ok, payouts_enabled: false })).toBe('action_required');
  });
  it('currently_due items are action required even while payouts are on', () => {
    expect(accountStatus({ ...ok, requirements: { ...ok.requirements, currently_due: ['external_account'] } })).toBe(
      'action_required'
    );
  });
  it('past_due items are action required', () => {
    expect(accountStatus({ ...ok, requirements: { ...ok.requirements, past_due: ['individual.dob.day'] } })).toBe(
      'action_required'
    );
  });
  it('a disabled_reason is action required', () => {
    expect(
      accountStatus({ ...ok, requirements: { ...ok.requirements, disabled_reason: 'requirements.past_due' } })
    ).toBe('action_required');
  });
});

describe('statusFields()', () => {
  it('unknown carries nulls, never a guessed false or []', () => {
    expect(statusFields(null)).toEqual({
      accountStatus: 'unknown',
      payoutsEnabled: null,
      chargesEnabled: null,
      requirementsCurrentlyDue: null,
      requirementsPastDue: null,
      disabledReason: null,
    });
  });
  it('known account reports what Stripe says', () => {
    expect(statusFields(ok)).toEqual({
      accountStatus: 'enabled',
      payoutsEnabled: true,
      chargesEnabled: true,
      requirementsCurrentlyDue: [],
      requirementsPastDue: [],
      disabledReason: null,
    });
  });
});

// The page's warning rule, kept next to the server's so they cannot drift:
// PayoutDashboardPage shows the warning only for 'action_required'.
describe('payout warning rule', () => {
  const warns = summary => summary.accountStatus === 'action_required';
  it('the real Ledyard state (account read 403, payouts paid Sep 17) shows no warning', () => {
    expect(warns({ stripeAccount: 'acct_x', ...statusFields(null) })).toBe(false);
  });
  it('a genuinely incomplete account still warns', () => {
    expect(warns({ stripeAccount: 'acct_x', ...statusFields({ ...ok, payouts_enabled: false }) })).toBe(true);
  });
});
