// Command dispatcher -- PURE decision logic. Takes a parsed command + a read-only
// view of state, returns the intended EFFECTS. It performs NO IO itself (no SMS,
// no DB) so the whole switchboard is unit-testable offline. webhook.js executes
// the effects at the edge.
//
// Result shape: {
//   toAdmin:    string | null,          // reply to the admin who texted
//   toCustomer: {thread, text} | null,  // message to relay to a customer
//   effect:     {op, ...} | null,       // state change for webhook.js to apply
// }
'use strict';
const { HELP_TEXT } = require('./commands');

const r = (o = {}) => ({ toAdmin: null, toCustomer: null, effect: null, ...o });

// deps (all read-only or injected):
//   me            : 'derek' | 'brandon'   (which admin texted)
//   getThread(n)  : {id, owner, status, contact_id, summary} | null
//   sticky        : {thread, until} | null  (this admin's active relay thread)
//   render        : { status(), list(), digest() } -> strings (data pulled by caller)
function dispatch(cmd, deps) {
  const { me, getThread, sticky, render } = deps;

  switch (cmd.type) {
    case 'HELP':   return r({ toAdmin: HELP_TEXT });
    case 'BAD':    return r({ toAdmin: cmd.usage });
    case 'STATUS': return r({ toAdmin: render.status() });
    case 'LIST':   return r({ toAdmin: render.list() });
    case 'DIGEST': return r({ toAdmin: render.digest() });

    case 'PAUSE':  return r({ toAdmin: 'Bot PAUSED. Autonomous sends are off. RESUME to re-enable. (STOP file is the hard kill.)', effect: { op: 'setPause', on: true } });
    case 'RESUME': return r({ toAdmin: 'Bot RESUMED. Autonomous sends back on.', effect: { op: 'setPause', on: false } });

    case 'TAKE': {
      const t = getThread(cmd.thread);
      if (!t) return r({ toAdmin: `No thread ${cmd.thread}. LIST to see open threads.` });
      if (t.owner && t.owner !== 'bot' && t.owner !== me)
        return r({ toAdmin: `${cap(t.owner)} owns thread ${cmd.thread}. TAKE ${cmd.thread} again to override.`, effect: { op: 'take', thread: cmd.thread, owner: me, override: true } });
      return r({ toAdmin: `You own thread ${cmd.thread} (${who(t)}). Bot is silent on it. Text to relay; DONE ${cmd.thread} when finished.`, effect: { op: 'take', thread: cmd.thread, owner: me } });
    }
    case 'BOT': {
      const t = getThread(cmd.thread);
      if (!t) return r({ toAdmin: `No thread ${cmd.thread}.` });
      return r({ toAdmin: `Thread ${cmd.thread} handed back to the bot.`, effect: { op: 'handback', thread: cmd.thread } });
    }
    case 'DONE': {
      const t = getThread(cmd.thread);
      if (!t) return r({ toAdmin: `No thread ${cmd.thread}.` });
      return r({ toAdmin: `Thread ${cmd.thread} marked resolved. ✔`, effect: { op: 'resolve', thread: cmd.thread } });
    }
    case 'SAY': {
      const t = getThread(cmd.thread);
      if (!t) return r({ toAdmin: `No thread ${cmd.thread}. Can't send.` });
      if (t.owner && t.owner !== 'bot' && t.owner !== me)
        return r({ toAdmin: `${cap(t.owner)} owns thread ${cmd.thread}. TAKE ${cmd.thread} to override, then send.` });
      return r({ toAdmin: `Sent to thread ${cmd.thread}.`, toCustomer: { thread: cmd.thread, text: cmd.text } });
    }
    case 'WATCH':   return getThread(cmd.thread)
      ? r({ toAdmin: `Watching thread ${cmd.thread}. UNWATCH ${cmd.thread} to stop.`, effect: { op: 'watch', thread: cmd.thread, who: me } })
      : r({ toAdmin: `No thread ${cmd.thread}.` });
    case 'UNWATCH': return r({ toAdmin: `Stopped watching thread ${cmd.thread}.`, effect: { op: 'unwatch', thread: cmd.thread, who: me } });

    case 'YES': return r({ toAdmin: `Approved action ${cmd.id}. Executing.`, effect: { op: 'approve', id: cmd.id } });
    case 'NO':  return r({ toAdmin: `Rejected action ${cmd.id}${cmd.reason ? ' — ' + cmd.reason : ''}.`, effect: { op: 'reject', id: cmd.id, reason: cmd.reason } });

    case 'RELAY': {
      if (!cmd.text) return r({ toAdmin: 'No active thread — LIST to see open threads, or TAKE <n>.' });
      if (sticky && sticky.thread)
        return r({ toCustomer: { thread: sticky.thread, text: cmd.text } });
      return r({ toAdmin: 'No active thread — TAKE <n> first, then your texts relay to that customer.' });
    }
    default: return r({ toAdmin: 'Unrecognized. ? for help.' });
  }
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const who = t => t && t.summary ? t.summary : (t && t.contact_id) || 'customer';

module.exports = { dispatch };
