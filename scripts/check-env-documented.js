#!/usr/bin/env node
/**
 * Keeps .env.example honest.
 *
 * Every environment variable the code actually reads must be documented in
 * .env.example. Without this, the canonical reference rots the moment someone
 * adds a `process.env.NEW_THING` — which is exactly how this repository ended up
 * with a template documenting SHARETRIBE_INTEGRATION_CLIENT_ID, a name no code
 * path has ever read.
 *
 *   node scripts/check-env-documented.js          # fail on undocumented vars
 *   node scripts/check-env-documented.js --list   # also list documented-but-unused
 *
 * Names only. This script never reads a variable's value.
 */

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const listUnused = process.argv.includes('--list');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.clj-kondo', '.lsp']);
const CODE_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

// Variables read by tooling/CI rather than the app, or supplied by the platform.
const EXEMPT = new Set([
  'NODE_ENV', 'NODE_DEBUG', 'CI', 'PORT', 'TAG', 'ENV', 'MODE', 'PROD', 'DEV',
  'NO_COLOR', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
  'GITHUB_BASE_REF', 'REACT_APP_ENV', 'MARKETPLACE_ROOT_URL',
  'REACT_APP_MARKETPLACE_ROOT_URL', 'PROFILE_SCHEMA_BASE_URL', 'SMOKE_BASE_URL',
]);

const PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /process\.env\[['"]([A-Z][A-Z0-9_]{2,})['"]\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]{2,})/g,
];
const DESTRUCTURED = /(?:const|let|var)\s*\{([^}]{1,600}?)\}\s*=\s*(?:process\.env|import\.meta\.env)/gs;

const used = new Map(); // NAME -> Set(file)

const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      continue;
    }
    if (!CODE_EXT.has(path.extname(entry.name))) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    // The scripts that police configuration necessarily mention variable names.
    if (rel.startsWith('scripts/check-env') || rel.startsWith('scripts/preflight')) continue;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const add = name => {
      if (!name || EXEMPT.has(name)) return;
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(rel);
    };
    for (const re of PATTERNS) {
      for (const m of text.matchAll(re)) add(m[1]);
    }
    for (const m of text.matchAll(DESTRUCTURED)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(':')[0].split('=')[0].trim();
        if (/^[A-Z][A-Z0-9_]{2,}$/.test(name)) add(name);
      }
    }
  }
};
walk(ROOT);

const examplePath = path.join(ROOT, '.env.example');
if (!fs.existsSync(examplePath)) {
  console.error('::error::.env.example is missing — it is the canonical variable reference.');
  process.exit(1);
}
const documented = new Set(
  fs
    .readFileSync(examplePath, 'utf8')
    .split('\n')
    .map(l => (l.match(/^([A-Z][A-Z0-9_]*)=/) || [])[1])
    .filter(Boolean)
);

const undocumented = [...used.keys()].filter(n => !documented.has(n)).sort();
const unused = [...documented].filter(n => !used.has(n)).sort();

if (undocumented.length) {
  console.error(`${undocumented.length} environment variable(s) are read by code but absent from .env.example:`);
  for (const n of undocumented) {
    const files = [...used.get(n)].slice(0, 3).join(', ');
    console.error(`  ${n}   (${files})`);
  }
  console.error('');
  console.error('Add each one to .env.example with a comment explaining what it is for.');
  process.exit(1);
}

console.log(`All ${used.size} environment variables read by code are documented in .env.example.`);
if (listUnused && unused.length) {
  console.log('');
  console.log(`${unused.length} documented but not read by any code path (candidates for removal):`);
  for (const n of unused) console.log(`  ${n}`);
}
process.exit(0);
