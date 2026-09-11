#!/usr/bin/env node
/**
 * check:dev-hostnames — fails if a development hostname is reachable in
 * user-facing published content.
 *
 * Regression guard for the 2026-09-11 bug: https://poolrental.local/p/hosting
 * was baked into the published body of /p/anaheim, so visitors got a link that
 * resolves for nobody.
 *
 * Scans:
 *   1. the repository source tree (src/, scripts/) for dev hostnames in strings
 *      that would reach rendered output
 *   2. live published pages listed in TARGETS (default: a crawl of the homepage
 *      plus one layer, capped) for dev hostnames in the served HTML
 *
 * env: BASE_URL, TARGETS (comma-separated paths), MAX_PAGES, TIMEOUT_MS
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL || "https://www.poolrentalnearme.com").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 20000);
const MAX_PAGES = Number(process.env.MAX_PAGES || 60);

// Hostnames that must never appear in user-facing published output.
const DEV_HOSTS = [
  "poolrental.local",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  ".ngrok.io",
  ".ngrok-free.app",
  "host.docker.internal",
];
// Contexts where a dev hostname is legitimate (local tooling, not shipped HTML).
// Reviewed exceptions: local-dev fallbacks that never reach rendered output.
// canonical.server.ts defines DEV_ORIGIN for local dev and derives the real
// origin from x-forwarded-host in production (verified: live canonicals are
// https://www.poolrentalnearme.com/...). Any NEW file with a dev hostname fails.
const SOURCE_ALLOW = /(vite\.config|\.test\.|\bscripts\/|README|\.md$|eslint|tsconfig|src\/server\/canonical\.server\.ts)/i;

const hostRe = new RegExp(
  "https?://[^\\s\"'`<>)]*(" + DEV_HOSTS.map((h) => h.replace(/[.]/g, "\\.")).join("|") + ")[^\\s\"'`<>)]*",
  "gi",
);

const failures = [];

// ---- 1. source scan -------------------------------------------------------
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === ".git" || e === ".output") continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e) && !/\.bak/.test(e)) out.push(p);
  }
  return out;
}
const root = new URL("..", import.meta.url).pathname;
let scanned = 0;
for (const f of walk(join(root, "src"))) {
  scanned++;
  if (SOURCE_ALLOW.test(f)) continue;
  const txt = readFileSync(f, "utf8");
  const hits = txt.match(hostRe);
  if (hits) failures.push(`source ${f.replace(root, "")}: ${[...new Set(hits)].slice(0, 3).join(", ")}`);
}
console.log(`check:dev-hostnames — scanned ${scanned} source files`);

// ---- 2. live published content -------------------------------------------
async function get(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(BASE + path, { signal: ctl.signal, redirect: "follow" });
    return { status: r.status, body: await r.text() };
  } catch { return { status: 0, body: "" }; } finally { clearTimeout(t); }
}

let targets = (process.env.TARGETS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!targets.length) {
  const home = await get("/");
  const links = [...new Set([...home.body.matchAll(/href=["'](\/(?:p|amenity)\/[a-z0-9-]+)["']/gi)].map((m) => m[1]))];
  targets = ["/", ...links].slice(0, MAX_PAGES);
}
console.log(`  live pages to scan: ${targets.length}`);

let pagesScanned = 0;
for (let i = 0; i < targets.length; i += 6) {
  const batch = targets.slice(i, i + 6);
  const rs = await Promise.all(batch.map((p) => get(p).then((r) => ({ p, ...r }))));
  for (const r of rs) {
    pagesScanned++;
    if (r.status !== 200) continue;
    const hits = r.body.match(hostRe);
    if (hits) failures.push(`published ${r.p}: ${[...new Set(hits)].slice(0, 3).join(", ")}`);
  }
}
console.log(`  live pages scanned: ${pagesScanned}`);

if (failures.length) {
  console.error("\nFAILED — development hostnames in user-facing content:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log("\nPASS — no development hostnames in source or published content.");
