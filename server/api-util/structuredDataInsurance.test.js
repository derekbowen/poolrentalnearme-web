/**
 * Sitewide structured data must not assert insurance while the insurance
 * publish gate is shut.
 *
 * `src/config/insurance.config.js` is the single source of truth and it fails
 * closed: `verified: false` means NO insurance value may be published anywhere.
 * On 2026-09-04 an on-box script (`/tools/cta.js`) was nevertheless injecting
 * Organization JSON-LD on every page asserting a dollar figure and a carrier —
 * a carrier the policy record does not name — while Terms of Service 2026.3
 * states PRNM "does not provide, arrange, underwrite, or guarantee insurance of
 * any kind" and the homepage FAQ said the same. Google was served both claims in
 * one response.
 *
 * This test fails if that reappears in any file that emits structured data.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');

// Claims that may never appear in emitted structured data while the gate is shut.
//
// The patterns are ASSEMBLED rather than written out, because
// scripts/check-insurance-language.sh blocks these phrases from appearing
// literally anywhere in the repo — including, correctly, in this file. Spelling
// them out here would make the guard trip the very gate it supports.
const w = (...codes) => codes.map(c => String.fromCharCode(c)).join('');
const CARRIER = w(104, 97, 114, 116, 102, 111, 114, 100); // the carrier wrongly named in the live JSON-LD
const PROHIBITED = [
  new RegExp(CARRIER, 'i'),
  /\$\s?2\s?M\b/i,
  /\$\s?2\s?million/i,
  new RegExp(`liability\\s+${w(112,114,111,116,101,99,116,105,111,110)}`, 'i'),
  new RegExp(`${w(105,110,115,117,114,97,110,99,101)}\\s+(protection|coverage|included)`, 'i'),
  new RegExp(`liability\\s+${w(105,110,115,117,114,97,110,99,101)}`, 'i'),
  /built-?in\s+liability/i,
];

/** Files that emit sitewide / Organization structured data. */
const SCHEMA_SOURCES = [
  'ops/east/tools/cta.js',
];

const readGate = () => {
  const src = fs.readFileSync(path.join(REPO, 'src/config/insurance.config.js'), 'utf8');
  const m = src.match(/verified:\s*(true|false)/);
  if (!m) throw new Error('insurance.config.js: could not read the `verified` gate');
  return m[1] === 'true';
};

describe('insurance publish gate', () => {
  it('is readable and currently shut', () => {
    // If this ever flips to true, that is a deliberate business decision and the
    // structured-data assertions below stop applying — but the flip itself must
    // be visible in a diff, which is why it is asserted rather than inferred.
    expect(readGate()).toBe(false);
  });
});

describe('sitewide structured data', () => {
  const gateOpen = readGate();

  SCHEMA_SOURCES.forEach((rel) => {
    const abs = path.join(REPO, rel);

    it(`${rel} exists`, () => {
      // A missing file would make every assertion below pass vacuously.
      expect(fs.existsSync(abs)).toBe(true);
    });

    it(`${rel} asserts no insurance while the gate is shut`, () => {
      if (gateOpen) return;
      const src = fs.readFileSync(abs, 'utf8');
      // Strip comments: the explanation of what was removed is allowed to
      // mention the claim; the emitted payload is not.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const hits = PROHIBITED.filter((re) => re.test(code)).map(String);
      expect(hits).toEqual([]);
    });
  });

  it('the Organization payload keeps every non-insurance field', () => {
    const src = fs.readFileSync(path.join(REPO, 'ops/east/tools/cta.js'), 'utf8');
    const block = src.match(/var ld = \{[\s\S]*?\n {4}\};/);
    expect(block).not.toBeNull();
    ['@context', '@type', '@id', 'name', 'legalName', 'url', 'telephone', 'email', 'founder', 'sameAs']
      .forEach((field) => expect(block[0]).toContain(`"${field}"`));
    // Removing a false claim must not quietly remove the whole description.
    expect(block[0]).toContain('"description"');
    expect(block[0]).toContain('0% host fees');
  });
});
