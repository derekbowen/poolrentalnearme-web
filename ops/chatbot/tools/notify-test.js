#!/usr/bin/env node
'use strict';
/**
 * Test that BOTH founders get the in-app notification, without involving a
 * customer: posts ONE private note @mentioning Derek and Brandon into a test
 * conversation you name. Each mentioned agent gets a conversation_mention
 * notification in the Chatwoot app (push too, once they enabled
 * push_conversation_mention and allowed notifications on the device).
 *
 * Dry run by default (prints the note, sends nothing):
 *   node --env-file=/path/to/.env tools/notify-test.js --conversation 12
 * Actually post it (deploy step, needs Derek's GO):
 *   node --env-file=/path/to/.env tools/notify-test.js --conversation 12 --send
 *
 * Uses CHATWOOT_URL, CHATWOOT_BOT_TOKEN, CHATWOOT_ACCOUNT_ID,
 * CHATWOOT_DEREK_USER_ID, CHATWOOT_BRANDON_USER_ID. Prints status codes only.
 */
const { ChatwootClient } = require('../engine/chatwoot');

function noteFor(agents, when = new Date()) {
  const mention = (a) => `[@${a.name}](mention://user/${a.id}/${encodeURIComponent(a.name)})`;
  return [
    'PRNM notification test (no customer involved)',
    agents.map(mention).join(' '),
    `Sent ${when.toISOString()} by tools/notify-test.js. If this reached you as an app notification, reply "got it" here as a private note.`,
  ].join('\n');
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const i = argv.indexOf('--conversation');
  const conv = i >= 0 ? argv[i + 1] : null;
  if (!conv || !/^\d+$/.test(conv)) {
    console.error('usage: tools/notify-test.js --conversation <id> [--send]');
    return 2;
  }
  const agents = [
    { id: env.CHATWOOT_DEREK_USER_ID, name: env.CHATWOOT_DEREK_NAME || 'Derek Bowen' },
    { id: env.CHATWOOT_BRANDON_USER_ID, name: env.CHATWOOT_BRANDON_NAME || 'Brandon Elias' },
  ];
  if (agents.some((a) => !a.id)) {
    console.error('missing CHATWOOT_DEREK_USER_ID or CHATWOOT_BRANDON_USER_ID');
    return 2;
  }
  const note = noteFor(agents);
  if (!argv.includes('--send')) {
    console.log(
      `dry run, nothing sent. Would post this private note to conversation ${conv}:\n\n${note}\n\nAdd --send to post it.`
    );
    return 0;
  }
  const client = new ChatwootClient({
    baseUrl: env.CHATWOOT_URL,
    token: env.CHATWOOT_BOT_TOKEN,
    accountId: env.CHATWOOT_ACCOUNT_ID,
  });
  const r = await client.sendNote(conv, note);
  console.log(
    r.ok
      ? `posted (HTTP ${r.status}). Both phones/browsers should show "You have been mentioned in conversation (#${conv})".`
      : `failed (HTTP ${r.status || r.error})`
  );
  return r.ok ? 0 : 1;
}

if (require.main === module) main().then((code) => process.exit(code));

module.exports = { noteFor, main };
