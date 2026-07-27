// Never text QA/synthetic accounts. Matches the 18 test users found in the
// phone-coverage audit (mailinator, example.com, claude-*, merlin-*, health/
// smoke/diag/e2e/repro/lockout probes) plus any future ones with those shapes.
const TEST_EMAIL_PATTERNS = [
  /@mailinator\.com$/i,
  /@example\.com$/i,
  /^claude-/i,
  /^merlin-/i,
  /login-health\+/i,
  /lockout-check\+/i,
  /(smoke|diag|e2e|repro|dup|conc|ssotest|write-diag)/i,
];

const isTestAccount = user => {
  const email = user?.attributes?.email || '';
  return TEST_EMAIL_PATTERNS.some(re => re.test(email));
};

module.exports = { isTestAccount, TEST_EMAIL_PATTERNS };
