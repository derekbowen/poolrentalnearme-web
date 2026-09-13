/**
 * Regenerate ./bookingProcess.data.json from the process definition.
 *
 * Run after any change to ext/transaction-processes/default-booking/process.edn:
 *   bun server/shadow/generate.js
 *
 * The table is committed rather than parsed at runtime so the engine stays a
 * pure data module with no file I/O. bookingProcess.test.js re-parses the .edn
 * and asserts the committed table still matches, so the two cannot drift.
 */
const fs = require('fs');
const path = require('path');
const { parseProcessEdn } = require('./processEdn');

const EDN = path.join(__dirname, '../../ext/transaction-processes/default-booking/process.edn');
const OUT = path.join(__dirname, 'bookingProcess.data.json');

const parsed = parseProcessEdn(fs.readFileSync(EDN, 'utf8'));
const payload = {
  _generated: 'bun server/shadow/generate.js — do not hand-edit',
  _source: 'ext/transaction-processes/default-booking/process.edn',
  processAlias: 'default-booking/release-1',
  states: parsed.states,
  transitions: parsed.transitions,
};
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
// This is a developer CLI; reporting what it wrote is the whole point.
// eslint-disable-next-line no-console
console.log(
  `wrote ${path.relative(process.cwd(), OUT)}: ` +
    `${parsed.transitions.length} transitions, ${parsed.states.length} states, ` +
    `${parsed.transitions.filter((t) => t.automatic).length} scheduled`
);
