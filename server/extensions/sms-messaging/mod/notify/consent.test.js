const consent = require('./consent');

const userWith = protectedData => ({
  id: { uuid: 'u1' },
  attributes: { email: 'h@example.org', profile: { displayName: 'Host', protectedData } },
});

describe('marketingConsentState', () => {
  it('reads a ticked box as granted', () => {
    expect(consent.marketingConsentState(userWith({ smsConsentMarketing: true }))).toBe(
      consent.GRANTED
    );
  });

  it('reads an unticked box as denied, not as missing', () => {
    expect(consent.marketingConsentState(userWith({ smsConsentMarketing: false }))).toBe(
      consent.DENIED
    );
  });

  it('reads a pre-checkbox account as unknown', () => {
    // Signed up before signup-form-v1: other consent keys exist, this one does not.
    expect(
      consent.marketingConsentState(userWith({ smsConsentService: true, phoneNumber: '+15551234567' }))
    ).toBe(consent.UNKNOWN);
  });

  it('treats a non-boolean record as unknown rather than truthy', () => {
    // A string 'false' is exactly the shape that would read as consent under
    // a naive truthiness check.
    expect(consent.marketingConsentState(userWith({ smsConsentMarketing: 'false' }))).toBe(
      consent.UNKNOWN
    );
    expect(consent.marketingConsentState(userWith({ smsConsentMarketing: 'yes' }))).toBe(
      consent.UNKNOWN
    );
  });

  it('is unknown when protectedData was never requested in the fieldset', () => {
    expect(consent.marketingConsentState({ id: { uuid: 'u' }, attributes: { profile: {} } })).toBe(
      consent.UNKNOWN
    );
    expect(consent.marketingConsentState({})).toBe(consent.UNKNOWN);
    expect(consent.marketingConsentState(null)).toBe(consent.UNKNOWN);
  });
});

describe('unknownPolicy', () => {
  it('defaults to block when the flag is absent', () => {
    expect(consent.unknownPolicy({})).toBe(consent.POLICY_BLOCK);
  });

  it('blocks on any value other than an exact "allow"', () => {
    expect(consent.unknownPolicy({ SMS_MARKETING_UNKNOWN_POLICY: 'true' })).toBe(
      consent.POLICY_BLOCK
    );
    expect(consent.unknownPolicy({ SMS_MARKETING_UNKNOWN_POLICY: 'ALLOW' })).toBe(
      consent.POLICY_BLOCK
    );
    expect(consent.unknownPolicy({ SMS_MARKETING_UNKNOWN_POLICY: '' })).toBe(consent.POLICY_BLOCK);
  });

  it('allows only on an exact "allow"', () => {
    expect(consent.unknownPolicy({ SMS_MARKETING_UNKNOWN_POLICY: 'allow' })).toBe(
      consent.POLICY_ALLOW
    );
  });
});

describe('mostRestrictive (two accounts sharing one phone)', () => {
  it('lets a recorded no outrank everything', () => {
    expect(consent.mostRestrictive(consent.GRANTED, consent.DENIED)).toBe(consent.DENIED);
    expect(consent.mostRestrictive(consent.DENIED, consent.GRANTED)).toBe(consent.DENIED);
    expect(consent.mostRestrictive(consent.UNKNOWN, consent.DENIED)).toBe(consent.DENIED);
  });

  it('lets unknown outrank granted', () => {
    expect(consent.mostRestrictive(consent.GRANTED, consent.UNKNOWN)).toBe(consent.UNKNOWN);
    expect(consent.mostRestrictive(consent.UNKNOWN, consent.GRANTED)).toBe(consent.UNKNOWN);
  });

  it('only stays granted when both say yes', () => {
    expect(consent.mostRestrictive(consent.GRANTED, consent.GRANTED)).toBe(consent.GRANTED);
  });

  it('is order-independent', () => {
    const states = [consent.GRANTED, consent.DENIED, consent.UNKNOWN];
    for (const a of states) {
      for (const b of states) {
        expect(consent.mostRestrictive(a, b)).toBe(consent.mostRestrictive(b, a));
      }
    }
  });
});

describe('isMarketingAllowed', () => {
  it('sends to a host who granted consent under either policy', () => {
    expect(consent.isMarketingAllowed(consent.GRANTED, consent.POLICY_BLOCK)).toBe(true);
    expect(consent.isMarketingAllowed(consent.GRANTED, consent.POLICY_ALLOW)).toBe(true);
  });

  it('never sends to a host who denied consent, even under the allow policy', () => {
    // The policy knob governs the unknown state only. A recorded no is final.
    expect(consent.isMarketingAllowed(consent.DENIED, consent.POLICY_BLOCK)).toBe(false);
    expect(consent.isMarketingAllowed(consent.DENIED, consent.POLICY_ALLOW)).toBe(false);
  });

  it('fails closed on unknown by default, and opens only when told to', () => {
    expect(consent.isMarketingAllowed(consent.UNKNOWN, consent.POLICY_BLOCK)).toBe(false);
    expect(consent.isMarketingAllowed(consent.UNKNOWN, consent.POLICY_ALLOW)).toBe(true);
  });
});
