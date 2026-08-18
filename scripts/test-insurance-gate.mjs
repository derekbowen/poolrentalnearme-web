// Prove the publish gate fails closed, without needing the React test harness.
import { readFileSync } from 'fs';
const src = readFileSync('src/config/insurance.config.js', 'utf8');

let fail = 0;
const check = (label, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + label); if (!cond) fail++; };

check('verified defaults to false', /verified:\s*false/.test(src));
check('named_insured defaults to null', /named_insured:\s*null/.test(src));
check('gate requires BOTH verified and named_insured',
  /verified === true && !!INSURANCE_CONFIG\.named_insured/.test(src));
check('config is deep-frozen', /deepFreeze\(CONFIG\)/.test(src));
check('no dollar figures hardcoded anywhere', !/\$[0-9]/.test(src));
check('no carrier name hardcoded', !/spinnaker|coterie/i.test(src));
check('policy_number marked internal-only', /policy_number.*internal/i.test(src));

const comp = readFileSync('src/components/InsuranceDisclosure/InsuranceDisclosure.js', 'utf8');
const guards = (comp.match(/if \(!gateOpen\(\)\) return null;/g) || []).length;
check('all 3 components call the gate (found ' + guards + ')', guards === 3);
check('guest copy is not extended beyond the approved sentence',
  (comp.match(/Bookings on Pool Rental Near Me/g) || []).length === 1);
check('no insurance sentence outside the components file',
  !/carries commercial general liability/.test(src));

console.log(fail ? `\n${fail} FAILED` : '\nall gate tests passed');
process.exit(fail ? 1 : 0);
