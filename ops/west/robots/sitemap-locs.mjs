// sitemap-locs.mjs — read every <loc> from a sitemap index and its children.
//
// Read-only: plain GET requests, one at a time, with a pause between them and an
// ordinary browser User-Agent. Nothing is sent except the request line.
//
// Used two ways:
//   * by robots.proposed.test.mjs when ROBOTS_LIVE=1 is set (checks today's sitemaps);
//   * from the command line, to refresh the committed fixtures (sitemap URLs, and the
//     sitemap files themselves):
//       node ops/west/robots/sitemap-locs.mjs --write-fixture
//     The fixture holds paths only and leaves out /l/... listing URLs, because a
//     listing slug is written by the host and can contain a person's name. Listing
//     URLs are checked in the live run and by synthetic cases in the tests.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

/**
 * @param {string} indexUrl a sitemap or sitemap index
 * @param {{delayMs?: number, extra?: string[]}} [opts] extra: further sitemap URLs to read (e.g. ones only robots.txt names)
 * @returns {Promise<{sitemaps: Array<{url: string, status: number, isIndex: boolean, count: number}>, locs: string[]}>}
 */
export async function fetchAllLocs(indexUrl, { delayMs = 700, extra = [] } = {}) {
  const queue = [indexUrl, ...extra];
  const seen = new Set();
  const sitemaps = [];
  const locs = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    const xml = await res.text();
    const found = extractLocs(xml);
    const isIndex = /<sitemapindex[\s>]/.test(xml);
    sitemaps.push({ url, status: res.status, isIndex, count: found.length });
    if (res.status !== 200) throw new Error(`${url} answered ${res.status}`);
    if (isIndex) queue.push(...found);
    else found.forEach((l) => locs.add(l));
    await sleep(delayMs);
  }
  return { sitemaps, locs: [...locs].sort() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const origin = 'https://www.poolrentalnearme.com';
  const { sitemaps, locs } = await fetchAllLocs(`${origin}/sitemap.xml`, { extra: [`${origin}/public-pools.xml`] });
  for (const s of sitemaps) console.log(`${s.status} ${s.isIndex ? 'index' : 'urls '} ${String(s.count).padStart(5)} ${s.url}`);
  const foreign = locs.filter((l) => !l.startsWith(origin + '/') && l !== origin);
  const listings = locs.filter((l) => l.startsWith(origin + '/l/'));
  console.log(`${locs.length} distinct URLs; ${listings.length} listing URLs; ${foreign.length} on another origin`);
  if (process.argv.includes('--write-fixture')) {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', `sitemap-paths.www.poolrentalnearme.com.${day}.txt`);
    const paths = locs.filter((l) => !listings.includes(l) && !foreign.includes(l)).map((l) => l.slice(origin.length) || '/');
    writeFileSync(file, paths.join('\n') + '\n');
    console.log(`wrote ${paths.length} paths to ${file} (update FIXTURE in robots-cases.mjs to use it)`);
    // The sitemap files themselves, so that a rule blocking one of them fails the suite.
    const filesFixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', `sitemap-files.www.poolrentalnearme.com.${day}.txt`);
    const files = sitemaps.map((s) => s.url).filter((u) => u.startsWith(origin + '/')).map((u) => u.slice(origin.length));
    writeFileSync(filesFixture, files.join('\n') + '\n');
    console.log(`wrote ${files.length} sitemap files to ${filesFixture} (update SITEMAP_FILES_FIXTURE in robots-cases.mjs to use it)`);
  }
}
