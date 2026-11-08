'use strict';
/**
 * The Chatwoot side of a handoff, in the order the 4.16.2 code needs:
 *
 *   1. POST custom_attributes   (full merged hash: prnm_role, prnm_booking_ref, ...)
 *   2. GET + POST labels        (existing + handoff / urgent / topic-* / role-*)
 *   3. POST private note        (@mentions Derek and Brandon → conversation_mention push for both)
 *   4. POST toggle_priority     (urgent topics only)
 *   5. POST toggle_status open  (bot token on a pending conversation = bot handoff)
 *
 * Every step must return 2xx. The first failure stops the run, so the
 * conversation stays pending and the customer is told the truth. A note that
 * already went out is not posted twice on a retry. `drop` removes labels that
 * no longer apply (handoff-overflow when a deferred handoff finally alerts).
 */

function uniq(a) {
  return [...new Set(a)];
}

/**
 * @returns {Promise<{ok: boolean, step?: string, status?: number, done: object}>}
 */
async function runHandoff({ client, convId, attributes, labels, note, urgent, done = {}, drop = [] }) {
  const progress = { ...done };
  const fail = (step, r) => ({ ok: false, step, status: r ? r.status : 0, done: progress });

  const a = await client.setCustomAttributes(convId, attributes);
  if (!a.ok) return fail('custom_attributes', a);
  progress.attributes = true;

  const g = await client.getLabels(convId);
  if (!g.ok) return fail('labels_get', g);
  // `drop`: labels that no longer apply (handoff-overflow once a deferred handoff finally alerts)
  const keep = (g.labels || []).filter((x) => !drop.includes(x));
  const l = await client.setLabels(convId, uniq([...keep, ...labels]));
  if (!l.ok) return fail('labels_set', l);
  progress.labels = true;

  if (!progress.note) {
    const n = await client.sendNote(convId, note);
    if (!n.ok) return fail('note', n);
    progress.note = true;
  }

  if (urgent) {
    const p = await client.togglePriority(convId, 'urgent');
    if (!p.ok) return fail('priority', p);
    progress.priority = true;
  }

  const t = await client.toggleStatus(convId, 'open');
  if (!t.ok) return fail('toggle_status', t);
  progress.status = true;
  return { ok: true, done: progress };
}

/**
 * Over a flood cap (D3): record the handoff without alerting anyone.
 *
 *   1. POST custom_attributes
 *   2. GET + POST labels      (+ handoff-capped / handoff-overflow)
 *   3. POST private note      only when `note` is given, and it carries no @mention
 *   4. POST toggle_priority   urgent topics only (no push in 4.16.2)
 *
 * Never toggle_status: opening the conversation is Chatwoot's bot handoff,
 * which pushes conversation_creation to every inbox member. It stays pending.
 */
async function runCappedHandoff({ client, convId, attributes, labels, note, urgent, done = {} }) {
  const progress = { ...done };
  const fail = (step, r) => ({ ok: false, step, status: r ? r.status : 0, done: progress });
  if (note && /mention:\/\//i.test(note)) throw new Error('a capped handoff note must not @mention anyone');

  const a = await client.setCustomAttributes(convId, attributes);
  if (!a.ok) return fail('custom_attributes', a);
  progress.attributes = true;

  const g = await client.getLabels(convId);
  if (!g.ok) return fail('labels_get', g);
  const l = await client.setLabels(convId, uniq([...(g.labels || []), ...labels]));
  if (!l.ok) return fail('labels_set', l);
  progress.labels = true;

  if (note && !progress.cappedNote) {
    const n = await client.sendNote(convId, note);
    if (!n.ok) return fail('note', n);
    progress.cappedNote = true;
  }

  if (urgent) {
    const p = await client.togglePriority(convId, 'urgent');
    if (!p.ok) return fail('priority', p);
    progress.priority = true;
  }
  return { ok: true, done: progress };
}

module.exports = { runHandoff, runCappedHandoff };
