#!/usr/bin/env node
/**
 * Read-only diagnostic for "I can't save changes to my account".
 *
 *   bun scripts/lookup-user.js --email someone@example.com
 *   bun scripts/lookup-user.js --id <user-uuid>
 *
 * Uses the EXISTING Sharetribe Integration credentials from the environment
 * (canonical names or the EAST aliases — see server/api-util/sharetribeCredentials.js).
 * It creates nothing, changes nothing, and sends nothing to the user.
 *
 * WHY THESE FIELDS: sdk.currentUser.updateProfile always sends firstName,
 * lastName, displayName, bio and the custom-field blocks, whatever the user
 * actually edited. So a rejection that reproduces on every save is almost
 * always one of those constants. This prints the shape of each — lengths,
 * emptiness, types — never the personal content.
 */
const { integrationCredentials, describeIntegrationCredentials } = require('../server/api-util/sharetribeCredentials');

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const email = arg('--email');
const id = arg('--id');

if (!email && !id) {
  console.error('Usage: bun scripts/lookup-user.js --email <email> | --id <uuid>');
  process.exit(2);
}

const creds = integrationCredentials();
console.log(describeIntegrationCredentials());
if (!creds.ok) {
  console.error('\nCannot continue without the Integration credentials.');
  console.error('Load them with:  source scripts/prnm-secrets.sh');
  process.exit(1);
}

const sdkPkg = require('sharetribe-flex-integration-sdk');
const sdk = sdkPkg.createInstance({ clientId: creds.clientId, clientSecret: creds.clientSecret });

const shape = v => {
  if (v === undefined) return 'undefined (key absent)';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.trim() === '' ? 'EMPTY STRING' : `string, ${v.length} chars`;
  if (Array.isArray(v)) return `array[${v.length}]`;
  return typeof v;
};

(async () => {
  const res = email
    ? await sdk.users.show({ email }, { expand: true })
    : await sdk.users.show({ id }, { expand: true });

  const u = res.data.data;
  const a = u.attributes || {};
  const p = a.profile || {};

  console.log('\n--- account ---');
  console.log('  id                :', u.id.uuid);
  console.log('  state             :', a.state, a.state === 'active' ? '' : '  <-- NOT active: blocks updates');
  console.log('  emailVerified     :', a.emailVerified, a.emailVerified ? '' : '  <-- unverified');
  console.log('  banned            :', a.banned);
  console.log('  deleted           :', a.deleted);
  console.log('  pendingEmail      :', a.pendingEmail ? 'set' : 'none');

  console.log('\n--- fields updateProfile always sends (shape only) ---');
  console.log('  firstName         :', shape(p.firstName));
  console.log('  lastName          :', shape(p.lastName));
  console.log('  displayName       :', shape(p.displayName));
  console.log('  bio               :', shape(p.bio));

  const bioLen = typeof p.bio === 'string' ? p.bio.length : 0;
  if (bioLen > 1000) console.log(`     ^ bio is ${bioLen} chars — long enough to be worth ruling out first`);
  if (typeof p.lastName === 'string' && p.lastName.trim() === '')
    console.log('     ^ lastName is empty; the form sends "" and the API rejects it');

  for (const scope of ['publicData', 'protectedData', 'privateData']) {
    const d = p[scope] || {};
    const keys = Object.keys(d);
    console.log(`\n--- ${scope} (${keys.length} keys) ---`);
    keys.forEach(k => console.log(`  ${k.padEnd(26)}: ${shape(d[k])}`));
  }
  console.log('\nRead-only: nothing was modified and no message was sent.');
})().catch(e => {
  const body = e.data || e.response?.data;
  console.error('\nLookup failed:', e.message);
  if (body) console.error(JSON.stringify(body, null, 2).slice(0, 1200));
  process.exit(1);
});
