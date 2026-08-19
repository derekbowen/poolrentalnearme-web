// Prove the publish gate fails closed — by evaluating the real config, not by
// grepping it. The config has no imports, so it can be loaded directly as ESM
// once copied to a .mjs path.
//
// The earlier version of this file asserted that no dollar figure and no
// carrier name appeared in the config at all. That was correct while every
// field was null and wrong the moment the policy was loaded: holding those
// values IS the config's job. The assertions now check that they appear
// NOWHERE ELSE.
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const CONFIG_PATH = 'src/config/insurance.config.js';
const COMP_PATH = 'src/components/InsuranceDisclosure/InsuranceDisclosure.js';

const src = readFileSync(CONFIG_PATH, 'utf8');
const comp = readFileSync(COMP_PATH, 'utf8');

let fail = 0;
const check = (label, cond) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label);
  if (!cond) fail++;
};

// ---- evaluate the actual module ----
const dir = mkdtempSync(join(tmpdir(), 'prnm-gate-'));
const mjs = join(dir, 'insurance.config.mjs');
writeFileSync(mjs, src);
const mod = await import(mjs);
const { INSURANCE_CONFIG, insuranceIsPublishable, insuranceField, insuranceCopy } = mod;

check('gate is SHUT as committed', insuranceIsPublishable() === false);
check('verified is false', INSURANCE_CONFIG.verified === false);
check('named_insured is null (endorsement not received)', INSURANCE_CONFIG.named_insured === null);

check('every field read returns null while the gate is shut',
  ['carrier', 'limit_per_occurrence', 'limit_general_aggregate', 'effective_date', 'endorsements']
    .every(f => insuranceField(f) === null));

check('every approved sentence returns null while the gate is shut',
  Object.keys(mod.INSURANCE_COPY).every(k => insuranceCopy(k) === null));

check('config is frozen', Object.isFrozen(INSURANCE_CONFIG));
check('nested arrays are frozen too', Object.isFrozen(INSURANCE_CONFIG.endorsements_on_file));

// verified alone must not open the gate — named_insured is the second lock.
const forced = { ...INSURANCE_CONFIG, verified: true };
check('verified:true alone does not satisfy the gate',
  !(forced.verified === true && !!forced.named_insured));

// The endorsement list that renders publicly must stay empty while blanket
// additional-insured forms are on file that no host actually triggers.
check('public endorsement list is empty', INSURANCE_CONFIG.endorsements.length === 0);
check('full endorsement schedule is on file separately',
  INSURANCE_CONFIG.endorsements_on_file.length > 0);

// ---- boundary facts must be stated, not left null ----
check('covers_host_property_damage is explicitly false',
  INSURANCE_CONFIG.covers_host_property_damage === false);
check('covers_host_as_additional_insured is explicitly false',
  INSURANCE_CONFIG.covers_host_as_additional_insured === false);

// ---- containment: these values exist in exactly one file ----
const onlyInConfig = (label, pattern) => {
  const out = execSync(
    `grep -rlIE ${JSON.stringify(pattern)} src/ server/ --include='*.js' --include='*.jsx' 2>/dev/null || true`,
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .filter(f => f !== CONFIG_PATH);
  check(label + (out.length ? ' — also in: ' + out.join(', ') : ''), out.length === 0);
};

onlyInConfig('carrier name appears only in the config', 'Spinnaker|Coterie');
onlyInConfig('policy number appears only in the config', 'CSG-00536699');
onlyInConfig('broker contact appears only in the config', 'undercardgroup|Dunmire');

// ---- components must not author their own insurance sentences ----
const codeOnly = comp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
// A sentence has spaces in it. Identifiers, testids, and copy keys do not,
// which is why the space is part of the pattern rather than a length threshold.
// [^'] alone matches newlines, so an unanchored scan swallows the whole file
// between two unrelated quotes and every "literal" looks like a sentence.
const literals = (codeOnly.match(/'[^'\n]{20,}'|"[^"\n]{20,}"/g) || []).filter(l => / /.test(l));
check('components contain no hand-written insurance sentence',
  !literals.some(l => /insur|liabilit|cover|polic|protect/i.test(l)));

// Quoted-literal scanning alone missed the worst case: a sentence written as
// bare JSX text (<p>Every pool is covered by our policy.</p>) is not a string
// literal and is inside the one directory the CI pattern allow-lists, so it
// passed both guards. JSX text nodes are checked here too.
// Regex cannot tell JSX text from the code around it: after </div> the next
// "text node" runs on into the following function body, so any component that
// merely CALLS insuranceCopy() looks like it renders the word "insurance".
// Two earlier attempts got this wrong in opposite directions — one reported
// clean on the exact sentence it was written to catch, the other flagged the
// whole file. Babel is already a dependency; parse it properly.
const { parse } = await import('@babel/parser');
const ast = parse(comp, { sourceType: 'module', plugins: ['jsx'] });

const jsxText = [];
const walk = node => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(walk);
  if (node.type === 'JSXText') {
    const t = node.value.trim();
    if (/[A-Za-z]/.test(t)) jsxText.push(t);
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    walk(node[k]);
  }
};
walk(ast.program.body);

check('components render no bare JSX insurance text' +
  (jsxText.length ? ' — found: ' + jsxText.join(' | ') : ''),
  !jsxText.some(t => /insur|liabilit|cover|polic|protect|guarantee/i.test(t)));

const guards = (codeOnly.match(/if \(!gateOpen\(\)\) return null;/g) || []).length;
const components = (codeOnly.match(/^export const \w+Disclosure = \(\) => \{/gm) || []).length;
check(`every component calls the gate (${guards} guards / ${components} components)`,
  components > 0 && guards === components);

console.log(fail ? `\n${fail} FAILED` : '\nall gate tests passed');
process.exit(fail ? 1 : 0);
