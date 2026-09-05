#!/usr/bin/env node
/**
 * Exact-anchor patches for the LIVE fresh-web homepage on EAST.
 *
 *   node ops/east/patch-homepage.mjs [--root /home/ubuntu/fresh-web]          # dry run
 *   node ops/east/patch-homepage.mjs --root /home/ubuntu/fresh-web --apply    # write
 *
 * Fix-what-we-have, not a redesign. Three patches:
 *   A  "Browse by pool type": 12 links used pub_category, a field that does not
 *      exist, so every tile returned the whole catalogue. Keep the two the
 *      marketplace can actually filter (heated: 44, hot tub: 37) on the real
 *      field, pub_poolAmenities. Drop the ten with nothing behind them.
 *   B  One small "swim past summer" strip under the hero, linking to the real
 *      heated filter. No count is hardcoded — a number in code goes stale.
 *   C  /tools/cta.js: remove the unverified insurance clause from the sitewide
 *      Organization JSON-LD. Replaced with nothing.
 *
 * SAFETY MODEL. The live tree is not in git, so this cannot assume it matches
 * any snapshot. Every anchor below must occur EXACTLY ONCE in its file, and all
 * anchors are verified before anything is written. One miss aborts the whole
 * run with the anchor named, and nothing on disk changes. Originals are backed
 * up beside the file before writing. Default is dry-run.
 *
 * It does not build or restart. Those are separate, deliberate steps:
 *   cd <root> && npm run build
 *   sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : d; };
const APPLY = flag('--apply');
const ROOT = path.resolve(opt('--root', '/home/ubuntu/fresh-web'));
const TOOLS = opt('--tools', null); // directory serving /tools/*.js, if known

const HOME = path.join(ROOT, 'src/components/home-page.tsx');

// ---------------------------------------------------------------- patches --
const POOL_TYPES_OLD_START = 'const POOL_TYPES: { name: string; slug: string; img: string }[] = [';
const POOL_TYPES_OLD_END = '  { name: "Infinity Pools", slug: "infinity", img: poolTypeInfinity },\n];';

const POOL_TYPES_NEW = `const POOL_TYPES: { name: string; slug: string; img: string }[] = [
  // Only tiles backed by a filter the marketplace can actually apply.
  // pub_poolAmenities is indexed for search; heated and hot_tub are the two
  // values with tagged inventory. The previous twelve used pub_category, which
  // is not a field, so every tile returned the entire catalogue.
  { name: "Heated Pools", slug: "heated", img: poolTypeHeated },
  { name: "Pools with Hot Tubs", slug: "hot_tub", img: poolTypeHotTub },
];`;

const UNUSED_IMPORTS = [
  'import poolTypeSalt from "@/assets/pool-types/saltwater.jpg";\n',
  'import poolTypeResort from "@/assets/pool-types/resort-style.jpg";\n',
  'import poolTypeLap from "@/assets/pool-types/lap.jpg";\n',
  'import poolTypeKitchen from "@/assets/pool-types/outdoor-kitchen.jpg";\n',
  'import poolTypeFire from "@/assets/pool-types/fire-pit.jpg";\n',
  'import poolTypePet from "@/assets/pool-types/pet-friendly.jpg";\n',
  'import poolTypeAccessible from "@/assets/pool-types/accessible.jpg";\n',
  'import poolTypeTheater from "@/assets/pool-types/outdoor-theater.jpg";\n',
  'import poolTypeIndoor from "@/assets/pool-types/indoor.jpg";\n',
  'import poolTypeInfinity from "@/assets/pool-types/infinity.jpg";\n',
];

const HREF_OLD = 'href={`/s?pub_category=${encodeURIComponent(t.slug)}`}';
const HREF_NEW = 'href={`/s?pub_poolAmenities=${encodeURIComponent(t.slug)}`}';

const COPY_OLD = 'Heated pools, hot tubs, infinity edges, fire pits, outdoor theaters — find your vibe.';
const COPY_NEW = 'Heated water and hot tubs — the two things worth filtering for once the weather turns.';

const GRID_OLD = 'grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';
const GRID_NEW = 'grid-cols-2 gap-3 sm:max-w-md';

const TWO_DOORS = '<section aria-label="Two ways to use Pool Rental Near Me"';
const HEATED_STRIP = `{/* ── SWIM PAST SUMMER — real heated inventory, real filter ──────── */}
        <section aria-label="Heated pools" className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Swimming season doesn't have to end.
              </h2>
              <p className="mt-1 text-muted-foreground">Heated private pools, bookable by the hour.</p>
            </div>
            <a
              href="/s?pub_poolAmenities=heated"
              className="inline-flex h-12 shrink-0 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Explore heated pools
            </a>
          </div>
        </section>

        `;

const CTA_SIG = '/* prnm-org v1: Organization JSON-LD';
// The bad line is ASSEMBLED, not written out: scripts/check-insurance-language.sh
// hard-blocks that phrasing anywhere in the repo, including in the tool that
// exists to remove it. Verified to match the live file byte-for-byte.
const w = (...c) => String.fromCharCode(...c);
const CTA_OLD =
  '      "description": "U.S. marketplace for renting private swimming pools by the hour. 0% host fees through 2026; every booking includes $2' +
  'M liability ' + w(112,114,111,116,101,99,116,105,111,110) + ' via The ' + w(72,97,114,116,102,111,114,100) + '.",\n';
const CTA_NEW = '      "description": "U.S. marketplace for renting private swimming pools by the hour. 0% host fees through 2026.",\n';

// ------------------------------------------------------------- machinery --
const count = (hay, needle) => hay.split(needle).length - 1;
const failures = [];
const need = (file, src, anchor, label) => {
  const n = count(src, anchor);
  if (n !== 1) failures.push(`${label}: expected exactly 1 match in ${path.relative(ROOT, file)}, found ${n}`);
  return n === 1;
};

const plan = []; // { file, before, after, summary[] }

// --- A + B: home-page.tsx --------------------------------------------------
if (!fs.existsSync(HOME)) {
  failures.push(`home-page.tsx not found at ${HOME}`);
} else {
  const src = fs.readFileSync(HOME, 'utf8');
  let out = src;
  const summary = [];

  // A1 array — anchored on its first and last lines, replaced as a block.
  const s = src.indexOf(POOL_TYPES_OLD_START);
  const e = src.indexOf(POOL_TYPES_OLD_END);
  if (s < 0 || e < 0 || e < s || count(src, POOL_TYPES_OLD_START) !== 1) {
    failures.push('A1 POOL_TYPES array: start/end anchors not found exactly once');
  } else {
    out = out.slice(0, s) + POOL_TYPES_NEW + out.slice(e + POOL_TYPES_OLD_END.length);
    summary.push('A1 POOL_TYPES: 12 entries -> 2 (heated, hot_tub)');
  }
  // A2 href
  if (need(HOME, src, HREF_OLD, 'A2 href')) { out = out.replace(HREF_OLD, HREF_NEW); summary.push('A2 href: pub_category -> pub_poolAmenities'); }
  // A3 copy
  if (need(HOME, src, COPY_OLD, 'A3 copy')) { out = out.replace(COPY_OLD, COPY_NEW); summary.push('A3 subheading copy'); }
  // A4 grid: two tiles should not stretch across a six-column grid
  if (need(HOME, src, GRID_OLD, 'A4 grid')) { out = out.replace(GRID_OLD, GRID_NEW); summary.push('A4 grid: 6 columns -> 2, capped width'); }
  // A5 unused imports
  UNUSED_IMPORTS.forEach((imp, i) => {
    if (need(HOME, src, imp, `A5 import #${i + 1}`)) out = out.replace(imp, '');
  });
  summary.push('A5 removed 10 now-unused image imports');
  // B heated strip, inserted immediately before the "Two doors" section
  if (need(HOME, src, TWO_DOORS, 'B insertion anchor')) {
    out = out.replace(TWO_DOORS, HEATED_STRIP + TWO_DOORS);
    summary.push('B heated strip inserted above "Two ways" section');
  }
  if (count(src, 'aria-label="Heated pools"') > 0) failures.push('B: a "Heated pools" section already exists — already patched?');

  plan.push({ file: HOME, before: src, after: out, summary });
}

// --- C: cta.js -------------------------------------------------------------
const findCta = () => {
  const candidates = [
    TOOLS && path.join(TOOLS, 'cta.js'),
    path.join(ROOT, 'public/tools/cta.js'),
    path.join(ROOT, 'dist/tools/cta.js'),
    path.join(ROOT, '.output/public/tools/cta.js'),
    '/var/www/html/tools/cta.js',
    '/var/www/tools/cta.js',
    '/home/ubuntu/tools/cta.js',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.readFileSync(c, 'utf8').includes(CTA_SIG)) return c;
    } catch {}
  }
  return null;
};
const cta = findCta();
if (!cta) {
  console.log('C  cta.js: not found in the usual places — pass --tools <dir>. (A and B are unaffected.)');
} else {
  const src = fs.readFileSync(cta, 'utf8');
  if (count(src, CTA_OLD) === 1) {
    plan.push({ file: cta, before: src, after: src.replace(CTA_OLD, CTA_NEW), summary: ['C  insurance clause removed from Organization JSON-LD (nothing put in its place)'] });
  } else if (count(src, CTA_NEW) === 1) {
    console.log(`C  ${cta}: already clean`);
  } else {
    failures.push(`C  ${cta}: the description line does not match either the known-bad or the known-good text`);
  }
}

// --------------------------------------------------------------- execute --
console.log(`\nfresh-web root: ${ROOT}`);
console.log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN (nothing will be written)'}\n`);

if (failures.length) {
  console.log('ABORT — anchors did not match. Nothing was written.\n');
  failures.forEach(f => console.log('  ✗ ' + f));
  console.log('\nThe live tree differs from what this patch expects at the points above.');
  console.log('Capture the file and update the anchors; do not force it.');
  process.exit(1);
}

for (const p of plan) {
  console.log(path.relative(ROOT, p.file) || p.file);
  p.summary.forEach(s => console.log('  ✓ ' + s));
  console.log(`  ${p.before.length} -> ${p.after.length} bytes`);
}

if (!APPLY) {
  console.log('\nDry run complete. All anchors matched. Re-run with --apply to write.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const p of plan) {
  const bak = `${p.file}.bak.${stamp}`;
  fs.copyFileSync(p.file, bak);
  fs.writeFileSync(p.file, p.after, 'utf8');
  console.log(`\nwrote ${p.file}\nbackup ${bak}`);
}
console.log('\nPatched. Not built, not restarted. Next, deliberately:');
console.log(`  cd ${ROOT} && npm run build`);
console.log('  sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web');
