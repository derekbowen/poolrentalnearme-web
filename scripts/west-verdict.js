#!/usr/bin/env node
/**
 * The single verdict. One screen, plain English, no interpretation required.
 *
 *   node scripts/west-verdict.js ./production-reconciliation
 *   node scripts/west-verdict.js ./production-reconciliation --markdown   # for a job summary
 *
 * Reads the artifact produced by scripts/capture-production-state.sh and answers
 * the only questions that gate the first canonical release. Exits 0 only when it
 * is genuinely safe to deploy.
 *
 * This is the shared engine: both the one-click workflow
 * (.github/workflows/verify-west.yml) and the one-command wrapper
 * (scripts/verify-west.sh) print exactly this, so the two paths can never
 * disagree with each other.
 *
 * Read-only. Touches nothing on WEST. Prints no secret value.
 */

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dir = path.resolve(argv.find(a => !a.startsWith('--')) || './production-reconciliation');
const asMarkdown = argv.includes('--markdown');

const readJson = p => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const sha256 = p => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  } catch {
    return null;
  }
};

const state = readJson(path.join(dir, 'state.json'));
const analysis = readJson(path.join(dir, 'deploy-script-analysis.json'));
const manifest = path.join(dir, 'file-manifest.txt');
const capturedScript = path.join(dir, 'west-deploy-script.sh');
const canonicalPath = path.join(ROOT, 'scripts', 'west-instance-deploy.sh');

// --- WEST ACCESS: did the capture actually run on the box?
const westAccess = !!(state && state.hostname);

// --- DEPLOY SCRIPT FOUND
const deployScriptFound = !!(analysis && analysis.exists);

// --- RUNTIME ENV INJECTION: re-derive from content, do not trust the capture.
let injection = false;
if (fs.existsSync(capturedScript)) {
  const c = fs.readFileSync(capturedScript, 'utf8');
  injection = /docker\s+run/.test(c) && /--env-file/.test(c);
} else if (analysis) {
  injection = !!(analysis.docker_run_detected && analysis.env_file_flag_detected);
}

// --- PRODUCTION DRIFT CAPTURED
let driftCaptured = false;
let manifestCount = 0;
if (fs.existsSync(manifest)) {
  const lines = fs.readFileSync(manifest, 'utf8').trim().split('\n').filter(Boolean);
  manifestCount = lines.length;
  driftCaptured = manifestCount > 0 && !lines[0].startsWith('(');
}

// --- CANONICAL SCRIPT MATCH
const canonicalSha = sha256(canonicalPath);
const onBoxSha = analysis && analysis.sha256 ? analysis.sha256 : null;
const canonicalMatch = !!(canonicalSha && onBoxSha && canonicalSha === onBoxSha);

// --- PATCH REQUIRED
const patchFile = path.join(dir, 'west-deploy-script.patch');
const patchRequired = !injection;
const patchGenerated = fs.existsSync(patchFile);

const safeToDeploy = westAccess && deployScriptFound && injection && driftCaptured;

// The single blocker, in priority order — never a list.
let blocker = null;
if (!westAccess) {
  blocker = 'WEST was never reached, so nothing could be captured. Authorize access and re-run this verification.';
} else if (!deployScriptFound) {
  blocker = `The on-box deploy script was not found on ${state.hostname}. Locations searched are listed in deploy-script-analysis.json; the real path needs identifying before anything can be deployed.`;
} else if (!injection) {
  blocker = patchGenerated
    ? 'The on-box deploy script starts the container WITHOUT --env-file, so the secret-free image would come up with no configuration. A corrected script and a patch have been generated automatically — install the patch on WEST, then re-run this verification.'
    : 'The on-box deploy script starts the container WITHOUT --env-file, so the secret-free image would come up with no configuration.';
} else if (!driftCaptured) {
  blocker = 'The build tree was not captured, so production drift is still unmeasured and the repository cannot yet be trusted as the source of truth.';
}

const YN = b => (b ? 'YES' : 'NO');
const PF = b => (b ? 'PASS' : 'FAIL');

const lines = [
  `WEST ACCESS: ${PF(westAccess)}`,
  `DEPLOY SCRIPT FOUND: ${YN(deployScriptFound)}`,
  `RUNTIME ENV INJECTION: ${PF(injection)}`,
  `PRODUCTION DRIFT CAPTURED: ${YN(driftCaptured)}`,
  `CANONICAL SCRIPT MATCH: ${YN(canonicalMatch)}`,
  `PATCH REQUIRED: ${YN(patchRequired)}`,
  '',
  `SAFE TO DEPLOY: ${YN(safeToDeploy)}`,
];

if (asMarkdown) {
  const out = [
    '## WEST verification',
    '',
    '```',
    ...lines,
    '```',
    '',
  ];
  if (blocker) out.push(`**Remaining blocker.** ${blocker}`, '');
  if (state && state.hostname) {
    out.push(
      `Captured ${state.captured_at} from \`${state.hostname}\`, container image \`${state.container_image || 'unknown'}\`, ${manifestCount} files in the build tree.`,
      ''
    );
  }
  if (!canonicalMatch && onBoxSha) {
    out.push(
      `On-box script \`${onBoxSha.slice(0, 16)}…\` differs from the canonical \`${(canonicalSha || '').slice(0, 16)}…\`. The captured copy is attached to this run as an artifact.`,
      ''
    );
  }
  console.log(out.join('\n'));
} else {
  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  if (blocker) {
    console.log('Remaining blocker:');
    console.log(`  ${blocker}`);
    console.log('');
  }
}

process.exit(safeToDeploy ? 0 : 1);
