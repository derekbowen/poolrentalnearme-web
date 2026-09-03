#!/usr/bin/env node
/**
 * Non-destructive environment validator.
 *
 * Run it before the app or a deploy starts. It reads variable NAMES only and
 * never prints, logs or returns a value — a variable is reported as present or
 * missing, nothing more.
 *
 *   node scripts/check-env.js              # validate the current environment
 *   node scripts/check-env.js --optional   # also list optional gaps
 *   node scripts/check-env.js --json       # machine-readable summary
 *
 * Exit codes:
 *   0  every production-critical variable is present
 *   1  at least one production-critical variable is missing
 *
 * Optional variables never affect the exit code: they gate features that are
 * designed to switch themselves off (SMS, AI listing generation, Sentry). The
 * point of separating them is that a missing REQUIRED variable is an outage and
 * a missing optional one is a disabled feature — the two should not look alike,
 * which is exactly how they have looked until now.
 *
 * Source of truth: docs/INFRASTRUCTURE_SECRET_AUDIT.md (2026-09-03 scan).
 */

/* eslint-disable no-console */

// Grouped by the service that issues the credential, because that is how you go
// and fix one: you open one dashboard, not one file.
const GROUPS = [
  {
    service: 'SHARETRIBE',
    required: [
      'VITE_SHARETRIBE_SDK_CLIENT_ID',
      'SHARETRIBE_SDK_CLIENT_SECRET',
      'SHARETRIBE_INTEGRATION_SDK_CLIENT_ID',
      'SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET',
    ],
    optional: ['VITE_SHARETRIBE_SDK_BASE_URL', 'VITE_SHARETRIBE_SDK_ASSET_CDN_BASE_URL'],
    // EAST (fresh-web) names the same integration credential differently. Accept
    // either spelling so this script is usable on both hosts.
    aliases: {
      SHARETRIBE_INTEGRATION_SDK_CLIENT_ID: ['SHARETRIBE_INTEG_CLIENT_ID'],
      SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET: ['SHARETRIBE_INTEG_CLIENT_SECRET'],
    },
  },
  {
    service: 'STRIPE',
    required: ['STRIPE_SECRET_KEY', 'VITE_STRIPE_PUBLISHABLE_KEY'],
    optional: ['STRIPE_IDENTITY_RENTAL_FLOW_ID'],
  },
  {
    service: 'SUPABASE',
    required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    optional: [],
  },
  {
    service: 'TWILIO',
    required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    // One sender must exist. Checked as an either/or below rather than as two
    // independent optionals, because having neither means every send fails.
    eitherOr: [['TWILIO_MESSAGING_SERVICE_SID', 'TWILIO_PHONE_NUMBER']],
    optional: ['TWILIO_INBOUND_URL', 'TWILIO_VALIDATE_SIGNATURE'],
  },
  {
    service: 'MARKETPLACE',
    required: ['VITE_MARKETPLACE_ROOT_URL', 'VITE_ENV', 'VITE_SHARETRIBE_USING_SSL'],
    optional: ['VITE_CSP', 'VITE_MARKETPLACE_NAME'],
  },
  {
    service: 'SIGNING KEYS',
    required: [],
    optional: [
      'ENCRYPTED_JWT_PRIVATE_KEY',
      'VITE_ENCRYPTED_JWT_PUBLIC_KEY',
      'RSA_PRIVATE_KEY',
      'RSA_PUBLIC_KEY',
      'ICAL_FEED_SECRET',
    ],
  },
  {
    service: 'ANTHROPIC',
    required: [],
    optional: ['ANTHROPIC_API_KEY', 'ANTHROPIC_LISTING_MODEL'],
  },
  {
    service: 'GEOCODING',
    required: [],
    optional: ['VITE_GOOGLE_MAPS_API_KEY', 'VITE_MAPBOX_ACCESS_TOKEN', 'NOMINATIM_URL'],
  },
  {
    service: 'MONITORING',
    required: [],
    optional: ['VITE_SENTRY_DSN', 'VITE_GOOGLE_ANALYTICS_ID', 'VITE_PLAUSIBLE_DOMAINS'],
  },
];

const args = new Set(process.argv.slice(2));
const showOptional = args.has('--optional');
const asJson = args.has('--json');

// Presence only. The value is never read into a variable that could be printed.
const isSet = name => {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '';
};

const resolve = (name, aliases = {}) => {
  if (isSet(name)) return { present: true, via: null };
  for (const alt of aliases[name] || []) {
    if (isSet(alt)) return { present: true, via: alt };
  }
  return { present: false, via: null };
};

const GREEN = '[32m';
const RED = '[31m';
const DIM = '[2m';
const RESET = '[0m';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (s, c) => (useColor ? `${c}${s}${RESET}` : s);

const missingRequired = [];
const missingOptional = [];
const report = [];

for (const group of GROUPS) {
  const lines = [];
  const aliases = group.aliases || {};

  for (const name of group.required) {
    const { present, via } = resolve(name, aliases);
    if (present) {
      lines.push(`  ${paint('✓', GREEN)} ${name}${via ? paint(`  (via ${via})`, DIM) : ''}`);
    } else {
      lines.push(`  ${paint('✗', RED)} ${name} ${paint('MISSING', RED)}`);
      missingRequired.push({ service: group.service, name });
    }
  }

  for (const pair of group.eitherOr || []) {
    const satisfiedBy = pair.find(n => isSet(n));
    if (satisfiedBy) {
      lines.push(`  ${paint('✓', GREEN)} ${satisfiedBy}${paint('  (sender)', DIM)}`);
    } else {
      lines.push(`  ${paint('✗', RED)} ${pair.join(' or ')} ${paint('MISSING', RED)}`);
      missingRequired.push({ service: group.service, name: pair.join(' or ') });
    }
  }

  for (const name of group.optional) {
    const { present } = resolve(name, aliases);
    if (present) {
      if (showOptional) lines.push(`  ${paint('✓', GREEN)} ${name}${paint('  optional', DIM)}`);
    } else {
      missingOptional.push({ service: group.service, name });
      if (showOptional) {
        lines.push(`  ${paint('-', DIM)} ${name} ${paint('not set (optional)', DIM)}`);
      }
    }
  }

  if (lines.length) report.push({ service: group.service, lines });
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: missingRequired.length === 0,
        missingRequired: missingRequired.map(m => m.name),
        missingOptionalCount: missingOptional.length,
      },
      null,
      2
    )
  );
  process.exit(missingRequired.length === 0 ? 0 : 1);
}

for (const { service, lines } of report) {
  console.log(service);
  lines.forEach(l => console.log(l));
}

console.log('');
if (missingRequired.length === 0) {
  console.log(paint('All production-critical variables are present.', GREEN));
  if (missingOptional.length && !showOptional) {
    console.log(paint(`${missingOptional.length} optional not set — re-run with --optional.`, DIM));
  }
  process.exit(0);
}

console.log(
  paint(`${missingRequired.length} production-critical variable(s) missing:`, RED)
);
for (const m of missingRequired) console.log(`  ${m.service}: ${m.name}`);
console.log('');
console.log('See docs/INFRASTRUCTURE_SECRET_AUDIT.md for where each one is meant to come from.');
process.exit(1);
