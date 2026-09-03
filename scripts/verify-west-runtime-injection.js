#!/usr/bin/env node
/**
 * Prove — or refuse to prove — that the on-box deploy script actually injects
 * the runtime environment into the container.
 *
 *   node scripts/verify-west-runtime-injection.js ./production-reconciliation
 *   node scripts/verify-west-runtime-injection.js ./production-reconciliation --json
 *
 * Background: `scripts/deploy.sh` now delivers the runtime `.env` to the
 * instance and exports `ENV_FILE`, and the image no longer carries secrets. The
 * script that actually runs `docker run` lives on the box, outside this
 * repository. If it ignores `ENV_FILE`, a secret-free image starts with no
 * configuration — the site would come up and every integration would be dead.
 *
 * This exits 1 whenever injection cannot be PROVEN. Absence of evidence is
 * treated as failure, because the failure mode is silent.
 *
 * When injection is not proven and the script content was captured, it writes a
 * corrected script and a reviewable patch into the artifact directory. The
 * insertion point is derived by parsing the real `docker run` invocation, never
 * guessed.
 */

/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const artifactDir = path.resolve(argv.find(a => !a.startsWith('--')) || './production-reconciliation');
const asJson = argv.includes('--json');

const G = '[32m', R = '[31m', D = '[2m', X = '[0m';
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (s, c) => (color ? `${c}${s}${X}` : s);
const yn = b => (b ? 'YES' : 'NO');

const analysisPath = path.join(artifactDir, 'deploy-script-analysis.json');
const scriptPath = path.join(artifactDir, 'west-deploy-script.sh');

if (!fs.existsSync(analysisPath)) {
  const msg = `No deploy-script-analysis.json in ${artifactDir}.`;
  if (asJson) {
    console.log(JSON.stringify({ ok: false, reason: 'artifact missing', artifactDir }, null, 2));
  } else {
    console.log('WEST RUNTIME ENV INJECTION');
    console.log('');
    console.log(`  ${paint('✗', R)} ${msg}`);
    console.log('');
    console.log('  Run scripts/capture-production-state.sh on WEST and bring the artifact back.');
    console.log('');
    console.log(paint('Runtime injection verified: NO', R));
  }
  process.exit(1);
}

const a = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
const content = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : null;

// Re-derive rather than trusting the capture's own booleans: the artifact is
// evidence, and this is the check.
const derived = content
  ? {
      dockerRun: /docker\s+run/.test(content),
      dockerCompose: /docker[- ]compose/.test(content),
      envFileFlag: /--env-file/.test(content),
      envFileVar: /ENV_FILE/.test(content),
    }
  : null;

const dockerRun = derived ? derived.dockerRun : !!a.docker_run_detected;
const envFileFlag = derived ? derived.envFileFlag : !!a.env_file_flag_detected;
const envFileVar = derived ? derived.envFileVar : !!a.env_file_variable_referenced;
const exists = !!a.exists;

// Proof requires all three: the script exists, it runs a container, and that
// invocation is handed an env file. A --env-file pointing at a hardcoded path
// still counts as injection, but only if ENV_FILE is what deploy.sh sets.
const injectionProven = exists && dockerRun && envFileFlag;
const usesOurVariable = envFileFlag && envFileVar;

// ------------------------------------------------- generate the correction
let patchWritten = null;
let proposedWritten = null;

if (content && exists && !injectionProven) {
  const lines = content.split('\n');
  const out = [...lines];

  // Locate the docker run invocation, including a backslash-continued one.
  let runIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/(^|[^#\w])docker\s+run\b/.test(lines[i])) {
      runIdx = i;
      break;
    }
  }

  if (runIdx >= 0) {
    const line = out[runIdx];
    const continued = /\\\s*$/.test(line);
    // Flags always precede the image reference, so inserting immediately after
    // `docker run` is valid regardless of what follows.
    const injected = line.replace(/(docker\s+run)(\s)/, '$1 --env-file "${ENV_FILE}"$2');
    out[runIdx] = injected !== line ? injected : line.replace(/(docker\s+run)\b/, '$1 --env-file "${ENV_FILE}"');
    if (continued) {
      // nothing further needed: the flag was placed on the first physical line
    }

    // Guarantee ENV_FILE has a value even if the caller did not export one.
    if (!envFileVar) {
      let insertAt = 0;
      if (out[0] && out[0].startsWith('#!')) insertAt = 1;
      out.splice(
        insertAt,
        0,
        '',
        '# Added by scripts/verify-west-runtime-injection.js.',
        '# Runtime secrets are no longer baked into the image; scripts/deploy.sh',
        '# delivers them to this host and passes the path as ENV_FILE.',
        'ENV_FILE="${ENV_FILE:-/home/ubuntu/.prnm-runtime.env}"',
        'if [ ! -f "$ENV_FILE" ]; then',
        '  echo "FATAL: runtime env file $ENV_FILE is missing; refusing to start a container with no configuration." >&2',
        '  exit 1',
        'fi'
      );
    }

    const proposed = out.join('\n');
    proposedWritten = path.join(artifactDir, 'proposed-west-deploy-script.sh');
    fs.writeFileSync(proposedWritten, proposed);

    // A minimal unified diff, generated without a diff dependency.
    const orig = content.split('\n');
    const next = proposed.split('\n');
    const hunk = [
      '--- a/west-deploy-script.sh',
      '+++ b/proposed-west-deploy-script.sh',
      `@@ -1,${orig.length} +1,${next.length} @@`,
    ];
    const nextSet = new Set(next);
    const origSet = new Set(orig);
    for (const l of orig) if (!nextSet.has(l)) hunk.push(`-${l}`);
    for (const l of next) if (!origSet.has(l)) hunk.push(`+${l}`);
    patchWritten = path.join(artifactDir, 'west-deploy-script.patch');
    fs.writeFileSync(patchWritten, hunk.join('\n') + '\n');
  }
}

// ------------------------------------------------------------------ report
const result = {
  ok: injectionProven,
  deployScriptFound: exists,
  deployScriptPath: a.deploy_script_path || null,
  sha256: a.sha256 || null,
  dockerInvocationFound: dockerRun,
  dockerCompose: derived ? derived.dockerCompose : !!a.docker_compose_detected,
  envFileFlagPresent: envFileFlag,
  envFileVariableReferenced: envFileVar,
  usesDeployScriptVariable: usesOurVariable,
  runtimeInjectionVerified: injectionProven,
  proposedScript: proposedWritten,
  patch: patchWritten,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(injectionProven ? 0 : 1);
}

const mark = b => (b ? paint('✓', G) : paint('✗', R));
console.log('WEST RUNTIME ENV INJECTION');
console.log('');
console.log(`  ${mark(exists)} Deploy script found: ${yn(exists)}${a.deploy_script_path ? paint(`  ${a.deploy_script_path}`, D) : ''}`);
console.log(`  ${mark(dockerRun)} Docker invocation found: ${yn(dockerRun)}`);
console.log(`  ${mark(envFileFlag)} --env-file present: ${yn(envFileFlag)}`);
console.log(`  ${mark(envFileVar)} ENV_FILE referenced: ${yn(envFileVar)}`);
console.log(`  ${mark(injectionProven)} Runtime injection verified: ${yn(injectionProven)}`);
if (a.sha256) console.log(paint(`      on-box sha256 ${a.sha256.slice(0, 16)}…`, D));
console.log('');

if (injectionProven) {
  if (!usesOurVariable) {
    console.log(paint('  Note: --env-file is present but does not reference ENV_FILE.', D));
    console.log(paint('  It points somewhere fixed. That still injects config, but deploy.sh', D));
    console.log(paint('  writes /home/ubuntu/.prnm-runtime.env — confirm they are the same path.', D));
    console.log('');
  }
  console.log(paint('VERIFIED — the container receives its runtime configuration.', G));
  process.exit(0);
}

console.log(paint('NOT VERIFIED — do not deploy the secret-free image.', R));
console.log('');
if (!exists) {
  console.log('  The on-box deploy script was not found in any known location.');
  console.log('  Locations searched are listed in deploy-script-analysis.json.');
} else if (!dockerRun) {
  console.log('  The script exists but contains no docker run invocation. It may delegate');
  console.log('  to something else — read deploy-script-findings.txt.');
} else {
  console.log('  The script runs a container but does not pass an env file, so the new');
  console.log('  image would start with no configuration at all.');
}
if (proposedWritten) {
  console.log('');
  console.log('  A corrected version has been generated from the real script:');
  console.log(`    ${path.relative(process.cwd(), proposedWritten)}`);
  console.log(`    ${path.relative(process.cwd(), patchWritten)}`);
  console.log('  Review the patch, then install it on WEST. Nothing was changed there.');
}
process.exit(1);
