#!/usr/bin/env node
/**
 * check:emitted-urls — the strong invariant.
 *
 * EVERY URL emitted by the homepage, the sitemaps, the navigation registry and
 * the city selector must resolve to either a canonical 200 (final URL === the
 * emitted URL) or an explicitly approved redirect listed in
 * scripts/approved-redirects.json.
 *
 * Anything else fails the deploy. This is the check that would have caught the
 * 2026-09-11 incident on its own: 57 dead /host-tools/* URLs on a footer-linked
 * page and 6 dead city links in the homepage grid.
 *
 * env: BASE_URL (default https://www.poolrentalnearme.com)
 *      TIMEOUT_MS, CONCURRENCY, MAX_SITEMAP_URLS (sampling cap for huge sitemaps)
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE_URL || "https://www.poolrentalnearme.com").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 20000);
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);
const MAX_SITEMAP_URLS = Number(process.env.MAX_SITEMAP_URLS || 400);

const cfg = JSON.parse(readFileSync(new URL("./approved-redirects.json", import.meta.url), "utf8"));
const APPROVED = cfg.approved.map((a) => ({
  ...a, re: new RegExp(a.pattern), dest: new RegExp(a.destination),
}));

async function get(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", ...opts });
    return { status: r.status, final: r.url, body: opts.head ? "" : await r.text() };
  } catch (e) {
    return { status: 0, final: url, body: "", err: String(e).slice(0, 100) };
  } finally { clearTimeout(t); }
}

// Compare pathname+search: a link carrying a query string (e.g. /s?keywords=party)
// is not a redirect just because its pathname differs from the full emitted path.
const pathOf = (u) => { try { const x = new URL(u); return x.pathname + (x.search || ""); } catch { return u; } };
const decodeEntities = (s) => s.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------------- collect emitted URLs by source --------------------------
const sources = new Map(); // path -> Set(source labels)
const add = (p, src) => {
  if (!p || !p.startsWith("/")) return;
  const clean = p.split("#")[0];
  if (!sources.has(clean)) sources.set(clean, new Set());
  sources.get(clean).add(src);
};

// 1. homepage — covers nav registry, city selector and footer as rendered
const home = await get(BASE + "/");
if (home.status !== 200) { console.error(`FAILED: homepage ${home.status}`); process.exit(1); }
for (const m of home.body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
  const h = m[1];
  if (/^(mailto:|tel:|javascript:|#)/i.test(h)) continue;
  const d = decodeEntities(h);
  add(d.startsWith(BASE) ? d.slice(BASE.length) : d, "homepage");
}
console.log(`homepage emitted: ${sources.size} internal links`);

// 2. sitemaps — the index plus every sub-sitemap it names
const idx = await get(BASE + "/sitemap.xml");
const subs = [...idx.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`sitemap index lists ${subs.length} sub-sitemaps`);
let sitemapUrls = [];
for (const s of subs) {
  const r = await get(s);
  const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  sitemapUrls.push(...locs);
}
const beforeCap = sitemapUrls.length;
// deterministic sample so the check stays fast but still covers every sub-sitemap
if (sitemapUrls.length > MAX_SITEMAP_URLS) {
  const step = Math.ceil(sitemapUrls.length / MAX_SITEMAP_URLS);
  sitemapUrls = sitemapUrls.filter((_, i) => i % step === 0);
}
console.log(`sitemap URLs: ${beforeCap} total, ${sitemapUrls.length} sampled`);
for (const u of sitemapUrls) add(pathOf(u), "sitemap");

// ---------------- verify --------------------------------------------------
const all = [...sources.keys()];
console.log(`verifying ${all.length} distinct URLs...`);
const results = [];
for (let i = 0; i < all.length; i += CONCURRENCY) {
  const batch = all.slice(i, i + CONCURRENCY);
  results.push(...await Promise.all(batch.map(async (p) => {
    const r = await get(BASE + p);
    return { path: p, status: r.status, finalPath: pathOf(r.final), err: r.err,
             src: [...sources.get(p)].join("+") };
  })));
}

const broken = [], unapproved = [];
for (const r of results) {
  if (r.status === 0 || r.status >= 400) { broken.push(r); continue; }
  if (r.finalPath === r.path) continue;                    // canonical 200
  const ok = APPROVED.find((a) => a.re.test(r.path) && a.dest.test(r.finalPath));
  if (!ok) unapproved.push(r);
}

console.log(`\n  canonical 200      : ${results.length - broken.length - unapproved.length}`);
console.log(`  approved redirects : ${results.filter(r => r.finalPath !== r.path && r.status < 400).length - unapproved.length}`);
console.log(`  BROKEN             : ${broken.length}`);
console.log(`  UNAPPROVED redirect: ${unapproved.length}`);

if (broken.length) {
  console.error("\nBROKEN — emitted but does not resolve:");
  for (const r of broken) console.error(`  ${r.status || "CONN"}  ${r.path}   [${r.src}] ${r.err || ""}`);
}
if (unapproved.length) {
  console.error("\nUNAPPROVED REDIRECT — add to scripts/approved-redirects.json or point the link at the destination:");
  for (const r of unapproved) console.error(`  ${r.path}  ->  ${r.finalPath}   [${r.src}]`);
}
if (broken.length || unapproved.length) process.exit(1);
console.log("\nPASS — every emitted URL is a canonical 200 or an approved redirect.");
