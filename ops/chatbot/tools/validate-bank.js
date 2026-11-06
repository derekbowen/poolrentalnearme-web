#!/usr/bin/env node
'use strict';
/**
 * Checks bank/entries.json + bank/routes.json after an edit:
 *   schema, 10 per category, unique ids, forbidden phrases, 911 lead lines,
 *   rule-8 topics never "auto", clarify routes wired, and every entry's
 *   question + variants still match that entry.
 * Exit code 1 on any error.   Usage: node tools/validate-bank.js
 */
const { loadBank, validateBank } = require('../engine/bank');
const { Engine } = require('../engine/flows');
const { roleOfCategory } = require('../engine/matcher');

function main() {
  const { entries, routes } = loadBank();
  const { errors, warnings } = validateBank(entries, routes);
  let engine = null;
  try {
    engine = new Engine({ bank: entries, routes });
  } catch (err) {
    errors.push(err.message);
  }
  const selfMisses = [];
  if (engine) {
    for (const e of entries) {
      const role = roleOfCategory(e.category);
      for (const text of [e.question, ...e.variants]) {
        const m = engine.matcher.match(text, { role });
        if (m.status !== 'confident' || m.top.id !== e.id) {
          selfMisses.push(`${e.id}: "${text}" → ${m.status} ${m.top ? m.top.id : '-'}`);
        }
      }
    }
  }
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const m of selfMisses) console.log(`error ${m}`);
  for (const e of errors) console.log(`error ${e}`);
  const total = entries.reduce((n, e) => n + 1 + e.variants.length, 0);
  console.log(
    `${entries.length} entries, ${total} questions+variants, ${selfMisses.length} self-match misses, ${errors.length} errors, ${warnings.length} warnings`
  );
  process.exit(errors.length || selfMisses.length ? 1 : 0);
}

main();
