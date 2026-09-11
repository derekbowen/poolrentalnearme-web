#!/usr/bin/env node
/**
 * check:homepage-cities — proves every city link rendered on the homepage
 * corresponds to a published canonical page.
 *
 * Regression guard for the 2026-09-11 bug: the grid was sourced from the
 * `cities` table but linked to /p/<slug>, which is a `content_pages` page.
 * 73 of 200 published cities had no content_pages row, so the homepage shipped
 * dead links (6 visible within the 60-card cap, 10 within the 72-row fetch).
 *
 * env: BASE_URL (default https://www.poolrentalnearme.com), TIMEOUT_MS
 */
const BASE = (process.env.BASE_URL || "https://www.poolrentalnearme.com").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 20000);
const CONCURRENCY = 8;

async function get(path, method = "GET") {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(BASE + path, { method, signal: ctl.signal, redirect: "follow" });
    return { status: r.status, finalPath: new URL(r.url).pathname, body: method === "GET" ? await r.text() : "" };
  } catch (e) {
    return { status: 0, finalPath: path, body: "", err: String(e).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}

const home = await get("/");
if (home.status !== 200) {
  console.error(`FAILED: homepage returned ${home.status}`);
  process.exit(1);
}

// City cards link to /p/<slug>. Exclude known non-city /p/ pages by shape:
// city slugs are lowercase words, optionally suffixed with a 2-letter state.
const hrefs = [...new Set([...home.body.matchAll(/<a\b[^>]*\bhref=["'](\/p\/[a-z0-9-]+)["']/gi)].map((m) => m[1]))];
console.log(`check:homepage-cities — base ${BASE}`);
console.log(`/p/ links on homepage: ${hrefs.length}`);

const results = [];
for (let i = 0; i < hrefs.length; i += CONCURRENCY) {
  const batch = hrefs.slice(i, i + CONCURRENCY);
  const rs = await Promise.all(batch.map((h) => get(h, "GET").then((r) => ({ href: h, ...r }))));
  results.push(...rs);
}

const broken = results.filter((r) => r.status === 0 || r.status >= 400);
const redirected = results.filter((r) => r.status === 200 && r.finalPath !== r.href);

console.log(`  200 canonical : ${results.length - broken.length - redirected.length}`);
console.log(`  redirected    : ${redirected.length}`);
console.log(`  BROKEN        : ${broken.length}`);

if (redirected.length) {
  console.log("\nredirecting (not fatal, but the homepage should link the destination):");
  redirected.forEach((r) => console.log(`  ${r.href} -> ${r.finalPath}`));
}

if (broken.length) {
  console.error("\nFAILED — homepage links to pages that do not resolve:");
  broken.forEach((r) => console.error(`  ${r.status || "CONN"}  ${r.href}  ${r.err || ""}`));
  process.exit(1);
}
console.log("\nPASS — every homepage /p/ link resolves to a published page.");
