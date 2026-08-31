const { isTestEmail, isTestAccount } = require('./exclude');

describe('synthetic accounts are still excluded', () => {
  const synthetic = [
    'anything@mailinator.com',
    'host@example.com',
    'claude-probe@prnm.test',
    'merlin-import@prnm.test',
    'login-health+42@prnm.test',
    'lockout-check+7@prnm.test',
    'smoke-test@prnm.test',
    'e2e+1@prnm.test',
    'diag@prnm.test',
    'write-diag@prnm.test',
    'qa.repro.case@prnm.test',
    'dup@prnm.test',
    'check_conc@prnm.test',
    'ssotest@prnm.test',
  ];
  it.each(synthetic)('excludes %s', email => {
    expect(isTestEmail(email)).toBe(true);
  });
});

describe('real hosts are not swept up by probe tokens', () => {
  // Every one of these matched the old unanchored patterns. This is the
  // regression that adding `email` to the betablast fieldset would have
  // shipped: a silent drop of ordinary hosts from the send list.
  const realHosts = [
    'mdupree@gmail.com',
    'sdupont@outlook.com',
    'duperry@comcast.net',
    'anne.duplessis@gmail.com',
    'jconcannon@yahoo.com',
    'maria.concepcion@gmail.com',
    'bconception@aol.com',
    'student@concordia.edu',
    'repromed.clinic@gmail.com',
    'joe.smokehouse@gmail.com',
    'tconklin@gmail.com',
    'diageo.fan@gmail.com',
  ];
  it.each(realHosts)('keeps %s', email => {
    expect(isTestEmail(email)).toBe(false);
  });
});

describe('domain rules apply to the address, probe rules only to the local part', () => {
  it('does not exclude a host whose DOMAIN merely contains a probe word', () => {
    expect(isTestEmail('owner@dupont-pools.com')).toBe(false);
    expect(isTestEmail('owner@concord-realty.com')).toBe(false);
  });

  it('still excludes on a synthetic domain regardless of local part', () => {
    expect(isTestEmail('perfectly.normal.name@mailinator.com')).toBe(true);
  });
});

describe('isTestAccount', () => {
  it('reads the email off an Integration API user resource', () => {
    expect(isTestAccount({ attributes: { email: 'smoke-test@prnm.test' } })).toBe(true);
    expect(isTestAccount({ attributes: { email: 'mdupree@gmail.com' } })).toBe(false);
  });

  it('does not treat a missing email as synthetic', () => {
    // A sparse fieldset that omits `email` must not silently exclude everyone
    // OR silently include everyone -- callers are responsible for requesting
    // the field, and betablast now does.
    expect(isTestAccount({ attributes: {} })).toBe(false);
    expect(isTestAccount({})).toBe(false);
    expect(isTestAccount(null)).toBe(false);
  });
});
