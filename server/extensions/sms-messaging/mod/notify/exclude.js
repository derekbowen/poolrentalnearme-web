// Never text QA/synthetic accounts. Matches the 18 test users found in the
// phone-coverage audit (mailinator, example.com, claude-*, merlin-*, health/
// smoke/diag/e2e/repro/lockout probes) plus any future ones with those shapes.
//
// The probe tokens used to be unanchored substrings tested against the whole
// address, which is safe only while nothing calls this. betablast did call it,
// but with a sparse fieldset that omitted `email`, so every user read as
// undefined and the guard never fired. Fixing the fieldset made the guard live
// and immediately exposed how broad the patterns were: `dup` and `conc` alone
// match mdupree@, sdupont@, duperry@, anne.duplessis@, jconcannon@,
// maria.concepcion@ and anyone @concordia.edu — all ordinary hosts.
//
// So probe tokens now have to be a DELIMITED SEGMENT of the local part:
// smoke-test@ and e2e+1@ match, joe.smokehouse@ and repromed.clinic@ do not.
// Domain rules still apply to the whole address.

// Whole-address rules: the domain itself marks the account as synthetic.
const FULL_EMAIL_PATTERNS = [/@mailinator\.com$/i, /@example\.com$/i];

// Local-part prefixes used by our own harnesses.
const LOCAL_PREFIX_PATTERNS = [
  /^claude-/i,
  /^merlin-/i,
  /^login-health\+/i,
  /^lockout-check\+/i,
];

// Probe words, but only as a whole dot/plus/underscore/hyphen-delimited
// segment of the local part — never as a substring of a real surname.
const LOCAL_PROBE_PATTERN = /(^|[._+-])(smoke|diag|e2e|repro|dup|conc|ssotest|write-diag)([._+-]|$)/i;

const localPart = email => {
  const at = String(email).lastIndexOf('@');
  return at === -1 ? String(email) : String(email).slice(0, at);
};

const isTestEmail = rawEmail => {
  const email = rawEmail || '';
  if (!email) return false;
  if (FULL_EMAIL_PATTERNS.some(re => re.test(email))) return true;
  const local = localPart(email);
  if (LOCAL_PREFIX_PATTERNS.some(re => re.test(local))) return true;
  return LOCAL_PROBE_PATTERN.test(local);
};

const isTestAccount = user => isTestEmail(user?.attributes?.email || '');

// Kept for callers that introspect the rule set. No longer a single flat list
// of whole-address regexes, because the probe tokens are local-part-scoped.
const TEST_EMAIL_PATTERNS = [
  ...FULL_EMAIL_PATTERNS,
  ...LOCAL_PREFIX_PATTERNS,
  LOCAL_PROBE_PATTERN,
];

module.exports = {
  isTestAccount,
  isTestEmail,
  TEST_EMAIL_PATTERNS,
  FULL_EMAIL_PATTERNS,
  LOCAL_PREFIX_PATTERNS,
  LOCAL_PROBE_PATTERN,
};
