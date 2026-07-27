// Admin command parser. Pure + synchronous: text in, structured command out.
// Any inbound from an ADMIN phone is a COMMAND, never customer flow. Commands are
// parsed FIRST; only a non-command (when a sticky thread is active) becomes RELAY.
// The parser NEVER sends or touches the DB -- that is the handler's job.
'use strict';

// canonical command set
const HELP_TEXT = [
  'PRNM Concierge — admin commands:',
  '? — this help',
  'STATUS — system state',
  'LIST — open threads',
  'TAKE 7 / T7 — take thread 7 (you own it, bot silent)',
  'BOT 7 / B7 — hand thread 7 back to the bot',
  'SAY 7 <msg> — one message into thread 7 as PRNM',
  'WATCH 7 / UNWATCH 7 — mirror a thread to your phone',
  'YES 12 / NO 12 <reason> — approve/reject pending action 12',
  'DONE 7 — mark resolved',
  'PAUSE / RESUME — global bot pause (STOP file = hard kill)',
  'DIGEST — daily summary now',
].join('\n');

// parse(text) -> { type, thread?, id?, text?, reason? }
// types: HELP STATUS LIST TAKE BOT SAY WATCH UNWATCH YES NO DONE PAUSE RESUME DIGEST RELAY
function parse(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { type: 'RELAY', text: '' };
  const upper = text.toUpperCase();
  const firstWord = upper.split(/\s+/)[0];
  const rest = text.slice(text.split(/\s+/)[0].length).trim();

  // zero-arg commands
  if (firstWord === '?' || firstWord === 'HELP') return { type: 'HELP' };
  if (firstWord === 'STATUS') return { type: 'STATUS' };
  if (firstWord === 'LIST') return { type: 'LIST' };
  if (firstWord === 'PAUSE') return { type: 'PAUSE' };
  if (firstWord === 'RESUME') return { type: 'RESUME' };
  if (firstWord === 'DIGEST') return { type: 'DIGEST' };

  // compact forms: T7 / B7  (letter immediately followed by digits)
  let m;
  if ((m = upper.match(/^T(\d+)$/)))  return { type: 'TAKE', thread: +m[1] };
  if ((m = upper.match(/^B(\d+)$/)))  return { type: 'BOT',  thread: +m[1] };

  // <VERB> <n> [rest]
  const parts = text.split(/\s+/);
  const verb = parts[0].toUpperCase();
  const n = parts[1] != null && /^\d+$/.test(parts[1]) ? +parts[1] : null;
  const tail = parts.slice(2).join(' ').trim();

  switch (verb) {
    case 'TAKE':    return n != null ? { type: 'TAKE', thread: n }   : bad('TAKE 7');
    case 'BOT':     return n != null ? { type: 'BOT', thread: n }    : bad('BOT 7');
    case 'DONE':    return n != null ? { type: 'DONE', thread: n }   : bad('DONE 7');
    case 'WATCH':   return n != null ? { type: 'WATCH', thread: n }  : bad('WATCH 7');
    case 'UNWATCH': return n != null ? { type: 'UNWATCH', thread: n }: bad('UNWATCH 7');
    case 'SAY':     return n != null && tail ? { type: 'SAY', thread: n, text: tail } : bad('SAY 7 <message>');
    case 'YES':     return n != null ? { type: 'YES', id: n }        : bad('YES 12');
    case 'NO':      return n != null ? { type: 'NO', id: n, reason: tail || null } : bad('NO 12 <reason>');
  }

  // not a command -> relay (handler decides if a sticky thread is active)
  return { type: 'RELAY', text };
}
function bad(usage) { return { type: 'BAD', usage: 'usage: ' + usage }; }

module.exports = { parse, HELP_TEXT };
