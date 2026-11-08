#!/usr/bin/env node
'use strict';
/**
 * PRNM scripted assistant: webhook receiver for a Chatwoot Agent Bot.
 *
 *   POST /webhook   (and POST /)  Chatwoot agent-bot events
 *   GET  /healthz                 {"ok":true,...}  (no secrets)
 *
 * Binds to 127.0.0.1:${PORT:-3120}. Requests must carry Chatwoot's signature
 * (X-Chatwoot-Signature = sha256 HMAC of "<timestamp>.<body>" with the bot
 * secret). Unsigned requests are accepted only when explicitly allowed for
 * local testing AND they come straight from loopback (not through a proxy).
 *
 * Environment (names only; values live in a mode-600 env file, never in git):
 *   CHATWOOT_URL                 http://127.0.0.1:3009
 *   CHATWOOT_BOT_TOKEN           agent bot access token
 *   CHATWOOT_ACCOUNT_ID          numeric account id
 *   CHATWOOT_INBOX_ID            website inbox id (recommended)
 *   CHATWOOT_WEBHOOK_SECRET      agent bot secret (HMAC)
 *   CHATWOOT_DEREK_USER_ID       Chatwoot user id for Derek Bowen
 *   CHATWOOT_BRANDON_USER_ID     Chatwoot user id for Brandon Elias
 *   CHATWOOT_PUBLIC_URL          https://chat.poolrentalnearme.com (links in the handoff note)
 *   CHATWOOT_FORWARDED_PROTO     https (default) | "" to omit
 *   SITE_URL                     https://www.poolrentalnearme.com
 *   PORT / HOST                  3120 / 127.0.0.1 (one default, the one ops/ and nginx use)
 *   BOT_DATA_DIR                 ./data  (state.json + events.jsonl, mode 600)
 *   BOT_ALLOW_UNSIGNED_LOOPBACK  "true" only for local testing
 *
 * Rejected (401) requests are logged at most once a minute, with a count of
 * the ones in between, so anyone POSTing junk at the public path cannot grow
 * the pm2 log without bound.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');

const { loadBank, validateBank } = require('./engine/bank');
const { Engine } = require('./engine/flows');
const { ChatwootClient } = require('./engine/chatwoot');
const { MemoryStore } = require('./engine/memory');
const { Tracker } = require('./engine/tracking');
const { Bot } = require('./engine/bot');
const { sampler } = require('./engine/logsample');

const MAX_BODY = 1024 * 1024;
const SIGNATURE_TOLERANCE_SEC = 300;
const DEFAULT_PORT = 3120;
const REJECT_LOG_EVERY_MS = 60 * 1000;
const DEFERRED_SWEEP_MS = 60 * 1000;

function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function verifySignature(secret, raw, timestamp, signature, nowMs = Date.now()) {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > SIGNATURE_TOLERANCE_SEC) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')}`;
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class Seen {
  constructor(max = 5000) {
    this.max = max;
    this.s = new Set();
  }
  check(k) {
    if (!k) return false;
    if (this.s.has(k)) return true;
    this.s.add(k);
    if (this.s.size > this.max) this.s.delete(this.s.values().next().value);
    return false;
  }
}

/**
 * @param {object} o
 * @param {Bot} o.bot
 * @param {string} [o.secret]
 * @param {boolean} [o.allowUnsignedLoopback]
 * @param {object} [o.logger]
 * @param {object} [o.health]  extra fields for /healthz
 */
function createServer({
  bot,
  secret = '',
  allowUnsignedLoopback = false,
  logger = console,
  health = {},
  rejectLogEveryMs = REJECT_LOG_EVERY_MS,
  now = () => Date.now(),
}) {
  const deliveries = new Seen();
  const logRejected = sampler(rejectLogEveryMs, now);
  let inflight = 0;
  const reply = (res, code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    res.end(body);
  };
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && (url === '/healthz' || url === '/health'))
      return reply(res, 200, { ok: true, ...health });
    if (
      req.method !== 'POST' ||
      !(url === '/webhook' || url === '/' || url === '/prnm-bot/webhook')
    )
      return reply(res, 404, { error: 'not found' });
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        reply(res, 413, { error: 'too large' });
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks);
      const sig = req.headers['x-chatwoot-signature'];
      const ts = req.headers['x-chatwoot-timestamp'];
      let trusted = false;
      if (secret) trusted = verifySignature(secret, raw, ts, sig);
      else if (allowUnsignedLoopback) {
        trusted =
          isLoopback(req.socket.remoteAddress) &&
          !req.headers['x-forwarded-for'] &&
          !req.headers['x-real-ip'];
      }
      if (!trusted) {
        logRejected(
          (m) => logger.warn(m),
          `rejected webhook: ${secret ? 'bad or missing signature' : 'unsigned request not allowed'}`
        );
        return reply(res, 401, { error: 'unauthorized' });
      }
      let payload;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply(res, 400, { error: 'bad json' });
      }
      if (deliveries.check(req.headers['x-chatwoot-delivery']))
        return reply(res, 200, { ok: true, duplicate: true });
      // Chatwoot waits at most 5 s: answer now, work after.
      inflight++;
      reply(res, 200, { ok: true });
      setImmediate(() => {
        bot
          .handleEvent(payload)
          .catch((err) => logger.error(`event failed: ${err && err.message ? err.message : err}`))
          .finally(() => {
            inflight--;
          });
      });
    });
  });
  /** Resolves when every accepted webhook has been fully processed (tests, shutdown). */
  server.drain = async () => {
    while (inflight > 0) await new Promise((r) => setTimeout(r, 2));
    await bot.idle();
  };
  return server;
}

function requireEnv(env, name) {
  const v = env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

/** Optional overrides for the D3 caps (defaults in engine/flood.js); bad values are ignored. */
function floodLimitsFrom(env) {
  const out = {};
  const pos = (v) => (/^\d+$/.test(String(v || '')) && Number(v) > 0 ? Number(v) : null);
  const map = {
    BOT_CAP_PER_CONVERSATION: 'perConversation',
    BOT_CAP_PER_CONTACT: 'perContact',
    BOT_CAP_GLOBAL_PER_HOUR: 'globalPerHour',
  };
  for (const [k, field] of Object.entries(map)) if (pos(env[k])) out[field] = pos(env[k]);
  return out;
}

function build(env = process.env) {
  const { entries, routes } = loadBank();
  const { errors } = validateBank(entries, routes);
  if (errors.length) throw new Error(`bank/entries.json is invalid:\n  ${errors.join('\n  ')}`);
  const allowUnsignedLoopback = env.BOT_ALLOW_UNSIGNED_LOOPBACK === 'true';
  const secret = env.CHATWOOT_WEBHOOK_SECRET || '';
  if (!secret && !allowUnsignedLoopback)
    throw new Error(
      'missing env CHATWOOT_WEBHOOK_SECRET (set BOT_ALLOW_UNSIGNED_LOOPBACK=true only for local testing)'
    );
  const dataDir = env.BOT_DATA_DIR || path.join(__dirname, 'data');
  const engine = new Engine({
    bank: entries,
    routes,
    siteUrl: env.SITE_URL || 'https://www.poolrentalnearme.com',
  });
  const client = new ChatwootClient({
    baseUrl: requireEnv(env, 'CHATWOOT_URL'),
    token: requireEnv(env, 'CHATWOOT_BOT_TOKEN'),
    accountId: requireEnv(env, 'CHATWOOT_ACCOUNT_ID'),
    forwardedProto:
      env.CHATWOOT_FORWARDED_PROTO === undefined ? 'https' : env.CHATWOOT_FORWARDED_PROTO,
  });
  const agents = [
    {
      id: requireEnv(env, 'CHATWOOT_DEREK_USER_ID'),
      name: env.CHATWOOT_DEREK_NAME || 'Derek Bowen',
    },
    {
      id: requireEnv(env, 'CHATWOOT_BRANDON_USER_ID'),
      name: env.CHATWOOT_BRANDON_NAME || 'Brandon Elias',
    },
  ];
  const store = new MemoryStore({ file: path.join(dataDir, 'state.json') });
  const tracker = new Tracker({ file: path.join(dataDir, 'events.jsonl') });
  const logger = {
    info: (m) => console.log(`${new Date().toISOString()} ${m}`),
    warn: (m) => console.warn(`${new Date().toISOString()} WARN ${m}`),
    error: (m) => console.error(`${new Date().toISOString()} ERROR ${m}`),
  };
  const bot = new Bot({
    engine,
    client,
    store,
    tracker,
    accountId: client.accountId,
    inboxId: env.CHATWOOT_INBOX_ID || null,
    agents,
    publicUrl: env.CHATWOOT_PUBLIC_URL || 'https://chat.poolrentalnearme.com',
    logger,
    floodLimits: floodLimitsFrom(env),
  });
  const server = createServer({
    bot,
    secret,
    allowUnsignedLoopback,
    logger,
    health: { entries: entries.length },
  });
  return {
    server,
    bot,
    store,
    logger,
    config: {
      port: Number(env.PORT || DEFAULT_PORT),
      host: env.HOST || '127.0.0.1',
      signed: !!secret,
      inbox: env.CHATWOOT_INBOX_ID || 'any',
      dataDir,
    },
  };
}

if (require.main === module) {
  let built;
  try {
    built = build();
  } catch (err) {
    console.error(`prnm-chatbot: ${err.message}`);
    process.exit(1);
  }
  const { server, bot, store, logger, config } = built;
  if (!isLoopback(config.host) && config.host !== 'localhost')
    logger.warn(`HOST=${config.host} is not loopback; nginx should be the only public entry`);
  server.listen(config.port, config.host, () => {
    // never print the token or secret
    logger.info(
      `prnm-chatbot listening on ${config.host}:${config.port} (signature check: ${config.signed ? 'on' : 'OFF, loopback only'}, inbox: ${config.inbox})`
    );
  });
  // a handoff logged over the hourly ceiling alerts once a slot frees up, even if nobody writes (D3)
  const sweep = setInterval(() => {
    try {
      bot.sweepDeferred();
    } catch (err) {
      logger.error(`deferred sweep failed: ${err && err.message ? err.message : err}`);
    }
  }, DEFERRED_SWEEP_MS);
  if (sweep.unref) sweep.unref();
  const stop = async () => {
    clearInterval(sweep);
    server.close();
    await server.drain().catch(() => {});
    store.flush();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { createServer, verifySignature, build, isLoopback, sampler, DEFAULT_PORT };
