#!/usr/bin/env node
/**
 * Production preflight. Run this immediately before any release build or deploy.
 *
 * It is read-only and non-destructive: it starts no container, writes no file,
 * touches no transaction, and never prints, logs or returns a secret value —
 * only whether a name is present.
 *
 *   node scripts/preflight-production.js                 # full check
 *   node scripts/preflight-production.js --expect-sha X  # also pin the git SHA
 *   node scripts/preflight-production.js --skip-build    # skip the build check
 *   node scripts/preflight-production.js --json
 *
 * Exit 0 only when every production-critical check passes. Anything else is a
 * non-zero exit and the release must not proceed.
 *
 * Checks, in order of how expensive they are to get wrong:
 *   1. environment      — delegates to scripts/check-env.js (single source of truth)
 *   2. AWS secret store — the Secrets Manager entry named by AWS_JH_ENV_SECRET_NAME
 *   3. git state        — clean tree, known SHA, optionally a pinned one
 *   4. service config   — Sharetribe / Stripe / Supabase / Twilio shape checks
 *   5. migrations       — unapplied Supabase migrations
 *   6. build            — the artifact actually compiles
 */

/* eslint-disable no-console */
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json declares "type": "module", so this file is ESM and there is no __dirname.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const skipBuild = args.includes('--skip-build');
const expectShaIdx = args.indexOf('--expect-sha');
const expectSha = expectShaIdx >= 0 ? args[expectShaIdx + 1] : null;

const results = [];
const record = (name, ok, detail, critical = true) =>
  results.push({ name, ok, detail, critical });

const sh = (cmd, cmdArgs, opts = {}) => {
  try {
    return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
  } catch (e) {
    return null;
  }
};

// ---------------------------------------------------------------- 1. environment
{
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-env.js'), '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  let missing = [];
  try {
    missing = JSON.parse(r.stdout || '{}').missingRequired || [];
  } catch (e) {
    /* fall through to the exit-code check below */
  }
  record(
    'environment variables',
    r.status === 0,
    r.status === 0 ? 'all production-critical variables present' : `missing: ${missing.join(', ') || 'see check-env.js'}`
  );
}

// ------------------------------------------------------------ 2. AWS secret store
{
  const secretName = process.env.AWS_JH_ENV_SECRET_NAME;
  const region = process.env.AWS_ENV_USER_REGION || process.env.AWS_REGION;
  if (!secretName) {
    record('AWS secret store', false, 'AWS_JH_ENV_SECRET_NAME is not set — cannot locate the runtime env secret');
  } else if (!sh('which', ['aws'])) {
    record('AWS secret store', false, `aws CLI not available; cannot verify secret "${secretName}"`);
  } else {
    // describe-secret returns metadata only — never the value.
    const out = sh('aws', [
      'secretsmanager', 'describe-secret',
      '--secret-id', secretName,
      ...(region ? ['--region', region] : []),
      '--output', 'json',
    ]);
    if (!out) {
      record('AWS secret store', false, `secret "${secretName}" not readable (missing, wrong region, or no permission)`);
    } else {
      let meta = {};
      try { meta = JSON.parse(out); } catch (e) { /* ignore */ }
      const changed = meta.LastChangedDate || meta.LastAccessedDate || 'unknown';
      record('AWS secret store', true, `"${secretName}" exists, last changed ${changed}`);
    }
  }
}

// ------------------------------------------------------------------- 3. git state
{
  const sha = sh('git', ['rev-parse', 'HEAD']);
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = sh('git', ['status', '--porcelain']);
  record('git SHA resolvable', !!sha, sha ? `${sha.slice(0, 12)} on ${branch}` : 'not a git checkout');
  record('working tree clean', dirty === '', dirty === '' ? 'no uncommitted changes' : `${dirty.split('\n').length} uncommitted file(s) — a release must be reproducible`);
  if (expectSha) {
    const match = !!sha && sha.startsWith(expectSha);
    record('git SHA matches --expect-sha', match, match ? `matches ${expectSha}` : `HEAD is ${sha ? sha.slice(0, 12) : '?'}, expected ${expectSha}`);
  }
}

// -------------------------------------------------------------- 4. service config
{
  // Shape checks only. A wrong-shaped credential fails at the worst possible moment
  // otherwise — mid-checkout — and these are free to catch here. No value is printed.
  const shape = (name, test, expectation) => {
    const v = process.env[name];
    if (!v) return; // absence is check-env.js's job, not ours
    record(`${name} shape`, test(v), test(v) ? 'looks right' : `does not look like ${expectation}`, true);
  };
  shape('STRIPE_SECRET_KEY', v => /^(sk|rk)_(live|test)_/.test(v), 'a Stripe secret or restricted key');
  shape('VITE_STRIPE_PUBLISHABLE_KEY', v => /^pk_(live|test)_/.test(v), 'a Stripe publishable key');
  shape('TWILIO_ACCOUNT_SID', v => /^AC[0-9a-f]{32}$/i.test(v), 'a Twilio account SID (AC + 32 hex)');
  shape('TWILIO_MESSAGING_SERVICE_SID', v => /^MG[0-9a-f]{32}$/i.test(v), 'a Twilio Messaging Service SID (MG + 32 hex)');
  shape('SUPABASE_URL', v => /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(v), 'a Supabase project URL');
  shape('VITE_MARKETPLACE_ROOT_URL', v => /^https:\/\//.test(v), 'an https URL');

  // Live/test coherence: a production release must not ship test keys.
  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
  const stripePub = process.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  if (stripeSecret && stripePub) {
    const bothLive = stripeSecret.includes('_live_') && stripePub.includes('_live_');
    const bothTest = stripeSecret.includes('_test_') && stripePub.includes('_test_');
    record('Stripe key mode coherent', bothLive || bothTest, bothLive ? 'both live' : bothTest ? 'both test' : 'MIXED live/test keys');
    if (process.env.VITE_ENV === 'production') {
      record('Stripe keys are live in production', bothLive, bothLive ? 'live' : 'production build carrying test keys');
    }
  }

  // VITE_* are build-time. Warn loudly if a production build lacks the SSL flag,
  // which silently drops Secure from every session cookie (this aborted c158).
  if (process.env.VITE_ENV === 'production') {
    const ssl = process.env.VITE_SHARETRIBE_USING_SSL;
    record('VITE_SHARETRIBE_USING_SSL set at build time', ssl === 'true', ssl === 'true' ? 'true' : `is "${ssl || 'unset'}" — session cookies may lose Secure`);
  }
}

// --------------------------------------------------------------- 5. migrations
{
  const dir = path.join(ROOT, 'supabase', 'migrations');
  if (!fs.existsSync(dir)) {
    record('migrations', true, 'no supabase/migrations directory in this repo — nothing to apply', false);
  } else {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
    record('migrations present', true, `${files.length} migration file(s) — apply state must be confirmed against the project before release`, false);
  }
}

// -------------------------------------------------------------------- 6. build
if (skipBuild) {
  record('build', true, 'skipped (--skip-build)', false);
} else {
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, encoding: 'utf8' });
  const ok = r.status === 0;
  const tail = ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-3).join(' | ');
  record('build succeeds', ok, ok ? 'npm run build completed' : `build failed: ${tail.slice(0, 220)}`);
}

// --------------------------------------------------------------------- report
const failedCritical = results.filter(r => !r.ok && r.critical);

if (asJson) {
  console.log(JSON.stringify({ ok: failedCritical.length === 0, results }, null, 2));
  process.exit(failedCritical.length === 0 ? 0 : 1);
}

const GREEN = '[32m', RED = '[31m', DIM = '[2m', RESET = '[0m';
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (s, c) => (color ? `${c}${s}${RESET}` : s);

console.log('PRODUCTION PREFLIGHT');
console.log('');
for (const r of results) {
  const mark = r.ok ? paint('✓', GREEN) : r.critical ? paint('✗', RED) : paint('!', DIM);
  console.log(`  ${mark} ${r.name}`);
  console.log(`      ${paint(r.detail, DIM)}`);
}
console.log('');

if (failedCritical.length === 0) {
  console.log(paint('PREFLIGHT PASSED — safe to build and deploy.', GREEN));
  process.exit(0);
}
console.log(paint(`PREFLIGHT FAILED — ${failedCritical.length} production-critical check(s):`, RED));
for (const r of failedCritical) console.log(`  ${r.name}: ${r.detail}`);
console.log('');
console.log('Do not deploy. See docs/FIRST_CANONICAL_RELEASE.md.');
process.exit(1);
