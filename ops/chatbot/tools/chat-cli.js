#!/usr/bin/env node
'use strict';
/**
 * Try the assistant in a terminal, no Chatwoot needed. Buttons print as
 * [1] Title; type the number to tap one, or type freely.
 *
 *   node tools/chat-cli.js                 interactive
 *   node tools/chat-cli.js "hi" "1" "..."  scripted (each arg is one customer turn)
 *   --fail-handoff                         simulate a Chatwoot failure during handoff
 *
 * Nothing is sent anywhere; the handoff note is printed instead.
 */
const readline = require('node:readline');
const { loadBank } = require('../engine/bank');
const { Engine } = require('../engine/flows');

const args = process.argv.slice(2);
const failHandoff = args.includes('--fail-handoff');
const script = args.filter((a) => a !== '--fail-handoff');

const { entries, routes } = loadBank();
const engine = new Engine({ bank: entries, routes });
let state = null;
let buttons = [];
const agents = [
  { id: 1, name: 'Derek Bowen' },
  { id: 2, name: 'Brandon Elias' },
];

function show(actions) {
  for (const a of actions) {
    if (a.type === 'say') console.log(`bot: ${a.content}`);
    if (a.type === 'select') {
      console.log(`bot: ${a.content}`);
      buttons = a.items;
      a.items.forEach((it, i) => console.log(`     [${i + 1}] ${it.title}`));
    }
    if (a.type === 'note') console.log(`  (private note) ${a.content}`);
    if (a.type === 'escalate') {
      console.log('  --- handoff note (private, @mentions both) ---');
      console.log(
        engine
          .buildNote(state, {
            agents,
            conversationUrl: 'https://chat.poolrentalnearme.com/app/accounts/1/conversations/1',
          })
          .split('\n')
          .map((l) => `  | ${l}`)
          .join('\n')
      );
      console.log(`  labels: ${engine.labelsFor(state).join(', ')}`);
      const after = engine.afterEscalation(
        state,
        failHandoff ? { ok: false, step: 'note', status: 500 } : { ok: true }
      );
      state = after.state;
      show(after.actions);
    }
  }
}

function turn(text) {
  const n = Number(text);
  const input =
    Number.isInteger(n) && n >= 1 && n <= buttons.length
      ? { kind: 'button', value: buttons[n - 1].value, title: buttons[n - 1].title }
      : { kind: 'text', text };
  console.log(`you: ${input.kind === 'button' ? `[${input.title}]` : text}`);
  buttons = [];
  const res = engine.handle(state, input);
  state = res.state;
  show(res.actions);
  for (const e of res.events)
    if (['answered', 'unmatched', 'clarify', 'handoff'].includes(e.type))
      console.log(`  · ${JSON.stringify(e)}`);
}

if (script.length) {
  for (const t of script) turn(t);
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });
  rl.prompt();
  rl.on('line', (line) => {
    turn(line);
    rl.prompt();
  });
}
