#!/usr/bin/env node
/**
 * Export the host -> Stripe connected-account mapping before it is gone.
 *
 * WHY THIS IS URGENT
 * ------------------
 * This mapping exists in exactly one place: Sharetribe. Nothing in this repo
 * stores it. `server/api/payouts.js:39` resolves a host's connected account by
 * calling `sdk.stripeAccount.fetch()` AS THAT AUTHENTICATED USER, so there is
 * no bulk table to read, and `st_users` has no Stripe column at all.
 *
 * Our Stripe platform account keeps the connected accounts (`acct_*`) after
 * Sharetribe goes away. What it does NOT keep is which pool host each one
 * belongs to. Without this export, re-attributing them means fuzzy-matching on
 * email, and a wrong match pays the wrong person.
 *
 * Unlike listing photos, this cannot be recovered from any mirror or cache.
 * Run it while Integration API credentials still authenticate.
 *
 *   SHARETRIBE_INTEGRATION_SDK_CLIENT_ID=... \
 *   SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET=... \
 *   node scripts/export-stripe-mapping.js --out ./prnm-export
 *
 * Accepts all three credential spellings this codebase has used
 * (SDK / INTEGRATION / INTEG), same precedence as
 * server/api-util/integrationCredentials.js.
 *
 * Reads only. Issues no writes to Sharetribe or Stripe.
 */

// ESM, not CommonJS: this repo's package.json sets "type": "module", so a .js
// file here is an ES module and `require` is not defined in it.
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_URL = 'https://flex-integ-api.sharetribe.com/v1/auth/token';
const API_BASE = 'https://flex-integ-api.sharetribe.com/v1/integration_api';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = argOf('out', './prnm-export');

const pick = (names) => {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === 'string' && v.trim() !== '') return { name: n, value: v.trim() };
  }
  return { name: null, value: null };
};

const id = pick([
  'SHARETRIBE_INTEGRATION_SDK_CLIENT_ID',
  'SHARETRIBE_INTEGRATION_CLIENT_ID',
  'SHARETRIBE_INTEG_CLIENT_ID',
]);
const secret = pick([
  'SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET',
  'SHARETRIBE_INTEGRATION_CLIENT_SECRET',
  'SHARETRIBE_INTEG_CLIENT_SECRET',
]);

if (!id.value || !secret.value) {
  console.error(
    'Integration API credentials not found. Set one pair:\n' +
      '  SHARETRIBE_INTEGRATION_SDK_CLIENT_ID / _SECRET   (WEST spelling)\n' +
      '  SHARETRIBE_INTEG_CLIENT_ID / _SECRET             (EAST spelling)\n' +
      'They are on the production boxes. Keep them out of shell history:\n' +
      '  read -s SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET && export SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET'
  );
  process.exit(1);
}

async function getToken() {
  const body = new URLSearchParams({
    client_id: id.value,
    client_secret: secret.value,
    grant_type: 'client_credentials',
    scope: 'integ',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `token ${res.status}: ${text.slice(0, 300)}\n\n` +
        (res.status === 401 || res.status === 403
          ? 'Credentials rejected. If the subscription lapsed, API access may already be\n' +
            'revoked — contact Sharetribe support and ask for a data-export window BEFORE\n' +
            'the account is purged. This mapping is not recoverable from any backup we hold.'
          : '')
    );
  }
  return (await res.json()).access_token;
}

async function main() {
  console.log('Authenticating to the Integration API...');
  const token = await getToken();
  console.log(`  ok (credentials read from ${id.name})\n`);

  const rows = [];
  let page = 1;
  const PER_PAGE = 100;

  for (;;) {
    const url =
      `${API_BASE}/users/query?page=${page}&perPage=${PER_PAGE}` +
      `&include=stripeAccount&fields.user=email,profile.displayName,profile.firstName,profile.lastName`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`users/query page ${page}: ${res.status} ${text.slice(0, 300)}`);
    }
    const body = await res.json();
    const users = body.data || [];
    const included = body.included || [];

    // stripeAccount arrives in `included`, keyed by the relationship's id.
    const stripeById = new Map();
    for (const inc of included) {
      if (inc.type === 'stripeAccount') {
        stripeById.set(String(inc.id?.uuid || inc.id), inc.attributes?.stripeAccountId || null);
      }
    }

    for (const u of users) {
      const rel = u.relationships?.stripeAccount?.data;
      const relId = rel ? String(rel.id?.uuid || rel.id) : null;
      rows.push({
        sharetribe_user_id: String(u.id?.uuid || u.id),
        email: u.attributes?.email ?? null,
        display_name: u.attributes?.profile?.displayName ?? null,
        first_name: u.attributes?.profile?.firstName ?? null,
        last_name: u.attributes?.profile?.lastName ?? null,
        stripe_account_id: relId ? (stripeById.get(relId) ?? null) : null,
        raw_user: u,
      });
    }

    process.stdout.write(`\r  page ${page}: ${rows.length} users`);
    const meta = body.meta || {};
    if (users.length < PER_PAGE || (meta.totalPages && page >= meta.totalPages)) break;
    page += 1;
    if (page > 1000) break; // backstop
  }

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'stripe-account-mapping.json');
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));

  const withStripe = rows.filter((r) => r.stripe_account_id);
  console.log(`\n\n─────────────────────────────────────────────`);
  console.log(`  users exported        : ${rows.length}`);
  console.log(`  WITH a Stripe account : ${withStripe.length}   <- the irreplaceable part`);
  console.log(`  without one           : ${rows.length - withStripe.length}`);
  console.log(`\n  Written to ${file}`);
  console.log(`\n  Back this up off-machine. Every payout you ever make to an existing`);
  console.log(`  host depends on this mapping, and Sharetribe is the only copy.`);

  if (withStripe.length === 0) {
    console.error(
      `\n  WARNING: not one Stripe account came back. Either no host has onboarded,\n` +
        `  or the include=stripeAccount relationship was not returned. Do NOT treat\n` +
        `  this as "there was nothing to export" — check one host by hand first.`
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
