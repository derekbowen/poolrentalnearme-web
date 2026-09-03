#!/usr/bin/env node
/**
 * Reconcile a captured production tree against this repository.
 *
 *   node scripts/reconcile-production.js ./production-reconciliation
 *   node scripts/reconcile-production.js ./production-reconciliation --json
 *   node scripts/reconcile-production.js ./production-reconciliation --write-report
 *
 * Input is the artifact produced by scripts/capture-production-state.sh.
 *
 * It never writes to production, never overwrites a repository file, and never
 * assumes production is correct. Its only job is to shrink the human review down
 * to the differences that genuinely need a decision — turning "149 files differ"
 * into a handful of behavioural questions.
 *
 * Classification:
 *   GENERATED  build output, lockfiles, maps, minified bundles      -> ignore
 *   STALE      .bak/.orig/dated backups, editor leftovers           -> delete on prod
 *   CONFIG     env templates, nginx, docker, CI, tooling config     -> move to the secret store / repo
 *   SOURCE     real application code                                -> merge decision required
 *   UNKNOWN    everything else                                      -> manual review
 *
 * Within SOURCE, files touching money, bookings, auth, notifications or SEO
 * routing are flagged HIGH RISK and listed first, because those are the ones
 * where "production was right and the repo was wrong" actually costs something.
 */

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const artifactDir = path.resolve(argv.find(a => !a.startsWith('--')) || './production-reconciliation');
const asJson = argv.includes('--json');
const writeReport = argv.includes('--write-report');

if (!fs.existsSync(artifactDir)) {
  console.error(`No artifact at ${artifactDir}`);
  console.error('Run scripts/capture-production-state.sh on WEST, copy the tarball back, extract it here.');
  process.exit(2);
}
const sourceDir = path.join(artifactDir, 'source');
if (!fs.existsSync(sourceDir)) {
  console.error(`${artifactDir} has no source/ directory — was the capture script interrupted?`);
  process.exit(2);
}

// --------------------------------------------------------------- classifiers
const GENERATED = [
  /^dist\//, /^build\//, /^coverage\//, /\.min\.(js|css)$/, /\.map$/,
  /^bun\.lockb$/, /^package-lock\.json$/, /^yarn\.lock$/, /^pnpm-lock\.yaml$/,
  /^\.cache\//, /^node_modules\//, /^public\/static\/.*\.(js|css)$/,
];
const STALE = [
  /\.bak(-|\.|$)/, /\.orig$/, /\.rej$/, /~$/, /\.swp$/, /\.save$/,
  /\.old$/, /\.backup/, /-\d{8}(T\d{6}Z)?$/, /\.copy$/, /\bcopy\s*\d*\.[a-z]+$/i,
];
const CONFIG = [
  /^\.env/, /^Dockerfile/, /^docker-compose/, /^nginx/, /\.conf$/,
  /^\.turtleci\//, /^\.github\//, /^vite\.config/, /^tailwind\.config/,
  /^postcss\.config/, /^\.eslintrc/, /^\.prettierrc/, /^jsconfig\.json$/,
  /^package\.json$/, /^\.gitignore$/, /^\.dockerignore$/,
];
const SOURCE = [/^src\//, /^server\//, /^scripts\//, /^ext\//, /^app-patches\//];

// Files where a silent difference between prod and git costs real money or trust.
const HIGH_RISK = [
  { re: /lineItem|commission|price|Price|fee|Fee/, why: 'pricing / fee calculation' },
  { re: /stripe|Stripe|payout|Payout|refund/, why: 'payments and payouts' },
  { re: /transaction|Transaction|process\.edn|booking|Booking/, why: 'booking / transaction state' },
  { re: /auth|Auth|login|jwt|Jwt|JWT|token|session/, why: 'authentication' },
  { re: /twilio|Twilio|sms|Sms|SMS|notify|poller|welcome/, why: 'notifications' },
  { re: /supabase|Supabase/, why: 'Supabase writes' },
  { re: /sitemap|robots|canonical|routeConfiguration|ssrStatus/, why: 'SEO / routing' },
  { re: /listing|Listing/, why: 'listing publication' },
];

const classify = rel => {
  if (GENERATED.some(re => re.test(rel))) return 'GENERATED';
  if (STALE.some(re => re.test(rel))) return 'STALE';
  if (CONFIG.some(re => re.test(rel))) return 'CONFIG';
  if (SOURCE.some(re => re.test(rel))) return 'SOURCE';
  return 'UNKNOWN';
};
const riskOf = rel => HIGH_RISK.filter(h => h.re.test(rel)).map(h => h.why);

const md5 = buf => crypto.createHash('md5').update(buf).digest('hex');
const read = p => {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------- walk
const walk = (dir, base = dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
};

const prodFiles = walk(sourceDir);
const findings = [];

for (const rel of prodFiles) {
  const prodBuf = read(path.join(sourceDir, rel));
  if (prodBuf === null) continue;
  const repoPath = path.join(ROOT, rel);
  const repoBuf = fs.existsSync(repoPath) ? read(repoPath) : null;

  let state;
  if (repoBuf === null) state = 'PRODUCTION_ONLY';
  else if (md5(prodBuf) === md5(repoBuf)) state = 'IDENTICAL';
  else state = 'DIFFERS';

  if (state === 'IDENTICAL') continue;

  const cls = classify(rel);
  const risk = riskOf(rel);
  let added = 0;
  let removed = 0;
  if (state === 'DIFFERS') {
    const a = repoBuf.toString('utf8').split('\n');
    const b = prodBuf.toString('utf8').split('\n');
    const setA = new Set(a);
    const setB = new Set(b);
    added = b.filter(l => l.trim() && !setA.has(l)).length;
    removed = a.filter(l => l.trim() && !setB.has(l)).length;
  }

  findings.push({
    file: rel,
    state,
    class: cls,
    productionOnly: state === 'PRODUCTION_ONLY',
    repoOnly: false,
    generated: cls === 'GENERATED',
    runtimeCritical: risk.length > 0,
    risk,
    linesAdded: added,
    linesRemoved: removed,
    recommendation:
      cls === 'GENERATED'
        ? 'ignore — build output, must not be in git'
        : cls === 'STALE'
          ? 'delete on production'
          : cls === 'CONFIG'
            ? 'move to the secret store or reconcile into the repo'
            : risk.length
              ? 'REVIEW THE DIFF — behavioural, high risk'
              : state === 'PRODUCTION_ONLY'
                ? 'review: production-only source, reproduce in the repo if legitimate'
                : 'review the diff',
  });
}

// Repo-only source files the production tree does not have.
const repoOnly = [];
for (const dir of ['src', 'server', 'scripts', 'ext']) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const rel of walk(abs, ROOT)) {
    if (rel.includes('node_modules')) continue;
    if (!fs.existsSync(path.join(sourceDir, rel))) repoOnly.push(rel);
  }
}

// ------------------------------------------------------------------ counts
const count = c => findings.filter(f => f.class === c).length;
const summary = {
  artifact: artifactDir,
  sourceCodeDifferences: count('SOURCE'),
  configDifferences: count('CONFIG'),
  generatedBuildDifferences: count('GENERATED'),
  staleFiles: count('STALE'),
  unknown: count('UNKNOWN'),
  productionOnlyFiles: findings.filter(f => f.productionOnly).length,
  repoOnlyFiles: repoOnly.length,
  highRisk: findings.filter(f => f.runtimeCritical && f.class === 'SOURCE').length,
  totalDifferences: findings.length,
};

let state = {};
try {
  state = JSON.parse(fs.readFileSync(path.join(artifactDir, 'state.json'), 'utf8'));
} catch {
  /* optional */
}

if (asJson) {
  console.log(JSON.stringify({ summary, state, findings, repoOnly }, null, 2));
  process.exit(0);
}

// ------------------------------------------------------------------ report
console.log('PRODUCTION RECONCILIATION');
if (state.hostname) console.log(`  captured ${state.captured_at} from ${state.hostname} (${state.container_image || 'image unknown'})`);
console.log('');
console.log(`  SOURCE CODE DIFFERENCES:    ${summary.sourceCodeDifferences}`);
console.log(`  CONFIG DIFFERENCES:         ${summary.configDifferences}`);
console.log(`  GENERATED BUILD DIFFERENCES:${String(summary.generatedBuildDifferences).padStart(4)}`);
console.log(`  STALE FILES:                ${summary.staleFiles}`);
console.log(`  UNKNOWN:                    ${summary.unknown}`);
console.log('');
console.log(`  production-only files: ${summary.productionOnlyFiles}   repo-only files: ${summary.repoOnlyFiles}`);
console.log(`  HIGH RISK needing a human decision: ${summary.highRisk}`);
console.log('');

const highRisk = findings.filter(f => f.runtimeCritical && f.class === 'SOURCE');
if (highRisk.length) {
  console.log('HIGH RISK — review these first:');
  for (const f of highRisk) {
    console.log(`  ${f.file}`);
    console.log(`      ${f.state}, +${f.linesAdded}/-${f.linesRemoved} lines — ${f.risk.join(', ')}`);
  }
  console.log('');
}

const otherSource = findings.filter(f => f.class === 'SOURCE' && !f.runtimeCritical);
if (otherSource.length) {
  console.log('SOURCE (lower risk):');
  for (const f of otherSource) console.log(`  ${f.file}  (${f.state}, +${f.linesAdded}/-${f.linesRemoved})`);
  console.log('');
}

const cfg = findings.filter(f => f.class === 'CONFIG');
if (cfg.length) {
  console.log('CONFIG:');
  for (const f of cfg) console.log(`  ${f.file}  (${f.state})`);
  console.log('');
}

const unknown = findings.filter(f => f.class === 'UNKNOWN');
if (unknown.length) {
  console.log('UNKNOWN — classify these by hand:');
  for (const f of unknown.slice(0, 40)) console.log(`  ${f.file}  (${f.state})`);
  if (unknown.length > 40) console.log(`  … and ${unknown.length - 40} more`);
  console.log('');
}

console.log(`Noise suppressed: ${summary.generatedBuildDifferences} generated + ${summary.staleFiles} stale files not shown individually.`);

if (writeReport) {
  const out = path.join(ROOT, 'docs/PRODUCTION_DRIFT_AUDIT.md');
  const rows = findings
    .sort((a, b) => Number(b.runtimeCritical) - Number(a.runtimeCritical) || a.file.localeCompare(b.file))
    .map(
      f =>
        `| \`${f.file}\` | ${f.state} | ${f.productionOnly ? 'yes' : 'no'} | no | ${f.generated ? 'yes' : 'no'} | ${f.runtimeCritical ? '**yes**' : 'no'} | ${f.recommendation} |`
    );
  const md = [
    '# Production drift audit',
    '',
    `Generated by \`scripts/reconcile-production.js\` from \`${path.basename(artifactDir)}\`.`,
    state.captured_at ? `Production captured ${state.captured_at} on ${state.hostname}.` : '',
    '',
    '| Class | Count |',
    '|---|---:|',
    `| Source code | ${summary.sourceCodeDifferences} |`,
    `| Config | ${summary.configDifferences} |`,
    `| Generated build output | ${summary.generatedBuildDifferences} |`,
    `| Stale | ${summary.staleFiles} |`,
    `| Unknown | ${summary.unknown} |`,
    `| **High risk (needs a decision)** | **${summary.highRisk}** |`,
    '',
    '| File | Change Type | Production Only? | Repo Only? | Generated? | Runtime Critical? | Recommendation |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  fs.writeFileSync(out, md);
  console.log('');
  console.log(`Wrote docs/PRODUCTION_DRIFT_AUDIT.md (${findings.length} rows).`);
}
