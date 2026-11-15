// What the PROPOSED www robots.txt is meant to do, case by case, and how it differs
// from the live file. Nothing here has been installed anywhere (see README.md).
//
// Run:            node --test ops/west/robots/*.test.mjs
// Live sitemaps:  ROBOTS_LIVE=1 node --test ops/west/robots/robots.proposed.test.mjs
//                 (read-only GETs of today's sitemap.xml and its children, ~15 s)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, explain, isAllowed, selectRules } from './robots-match.mjs';
import { read, lines, LIVE, PROPOSED, FIXTURE, CASES, UUID, LISTING, WELCOME_BOTS, BLOCKED_BOTS } from './robots-cases.mjs';
import { fetchAllLocs } from './sitemap-locs.mjs';

const live = parseRobots(read(LIVE));
const proposed = parseRobots(read(PROPOSED));
const AGENTS = ['Googlebot', 'ExampleBot'];
const verdict = (robots, agent, p) => (isAllowed(robots, agent, p) ? 'allow' : 'disallow');

describe('proposed www file: structure', () => {
  test('no rule sits outside a group; Crawl-Delay is the only ignored line', () => {
    assert.deepEqual(proposed.ignored.map((i) => i.text), ['Crawl-Delay: 5']);
  });
  test('Googlebot still follows the "*" group (no Googlebot group was added)', () => {
    assert.equal(selectRules(proposed, 'Googlebot').agent, '*');
  });
  test('the Sitemap lines are unchanged, and neither is disallowed', () => {
    assert.deepEqual(proposed.sitemaps, live.sitemaps);
    for (const s of proposed.sitemaps) assert.equal(isAllowed(proposed, 'Googlebot', s), true);
  });
  test('plain text: LF line endings, ASCII, ends with a newline, under 500 KiB', () => {
    const text = read(PROPOSED);
    assert.equal(/\r/.test(text), false);
    assert.equal(/[^\x00-\x7F]/.test(text), false);
    assert.equal(text.endsWith('\n'), true);
    assert.ok(Buffer.byteLength(text) < 500 * 1024);
  });
  test('every rule path starts with "/"', () => {
    for (const g of proposed.groups) for (const r of g.rules) assert.equal(r.path.startsWith('/'), true, r.path);
  });
});

describe('proposed www file: Googlebot and an unnamed crawler', () => {
  for (const c of CASES) {
    const changed = c.live !== c.proposed;
    const label = changed
      ? `FIXED (${c.edit}): ${c.path} is ${c.proposed}ed (live file: ${c.live}ed)`
      : c.defect
        ? `UNCHANGED ON PURPOSE: ${c.path} stays ${c.proposed}ed — ${c.edit}`
        : `${c.path} is ${c.proposed}ed`;
    test(label, () => {
      for (const agent of AGENTS) {
        const r = explain(proposed, agent, c.path);
        assert.equal(r.allowed ? 'allow' : 'disallow', c.proposed, `${agent} ${c.path} (rule: ${r.rule?.type} ${r.rule?.path})`);
      }
    });
  }
});

describe('proposed www file: the only differences from the live file are the intended ones', () => {
  test('for Googlebot, the cases that change are exactly the ones marked with an edit E1, E2, E3, E4 or E6', () => {
    const changed = CASES.filter((c) => verdict(live, 'Googlebot', c.path) !== verdict(proposed, 'Googlebot', c.path)).map((c) => c.path);
    const marked = CASES.filter((c) => /^E[12346]\b/.test(c.edit ?? '')).map((c) => c.path);
    assert.deepEqual(changed, marked);
  });
  test('the only thing newly blocked for Googlebot is /host/preview/ (E1)', () => {
    const newlyBlocked = CASES.filter((c) => c.live === 'allow' && c.proposed === 'disallow').map((c) => c.path);
    assert.deepEqual(newlyBlocked, ['/host/preview/x', '/host/preview/start']);
  });
  test('every "Disallow" of the live "*" group is still there, narrowed or moved only where an edit says so', () => {
    const liveStar = selectRules(live, 'Googlebot').rules.filter((r) => r.type === 'disallow').map((r) => r.path);
    const propStar = selectRules(proposed, 'Googlebot').rules.filter((r) => r.type === 'disallow').map((r) => r.path);
    const replaced = {
      '/l/new': ['/l/new$', '/l/new?'], // E3
      '/auth': ['/auth$', '/auth?', '/auth/'], // E4
      '/order': ['/order/'], // E6
      '/sale': ['/sale/'], // E6
      '/p/p/': [], // E2: removed
    };
    const expected = [...liveStar.flatMap((p) => replaced[p] ?? [p]), '/host/preview/']; // E1: moved in
    assert.deepEqual([...propStar].sort(), expected.sort());
  });
});

describe('proposed www file: named crawlers (E5)', () => {
  for (const bot of WELCOME_BOTS) {
    test(`${bot} shares the main group: same answer as Googlebot for every case`, () => {
      assert.equal(selectRules(proposed, bot).agent, bot.toLowerCase());
      for (const c of CASES) assert.equal(verdict(proposed, bot, c.path), c.proposed, `${bot} ${c.path}`);
    });
  }
  test('welcome crawlers can still fetch every public page type', () => {
    for (const bot of WELCOME_BOTS) {
      for (const p of ['/', '/p/hosting', '/public-pools/delaware/dover/', LISTING, '/s', '/sitemap.xml']) {
        assert.equal(isAllowed(proposed, bot, p), true, `${bot} ${p}`);
      }
    }
  });
  for (const bot of BLOCKED_BOTS) {
    test(`${bot} is still blocked from everything`, () => {
      for (const p of ['/', '/p/hosting', LISTING, '/s', '/p/p/anything']) assert.equal(isAllowed(proposed, bot, p), false, `${bot} ${p}`);
    });
  }
  test('no crawler named in the live file was dropped', () => {
    const named = (parsed) => [...new Set(parsed.groups.flatMap((g) => g.agents))].sort();
    assert.deepEqual(named(proposed), named(live));
  });
});

describe('proposed www file: every sitemap URL must be allowed', () => {
  const paths = lines(FIXTURE);
  for (const agent of [...AGENTS, 'GPTBot']) {
    test(`snapshot of 2026-11-15 (${paths.length} paths, listing URLs left out): none blocked for ${agent}`, () => {
      assert.deepEqual(paths.filter((p) => !isAllowed(proposed, agent, p)), []);
    });
  }
  test('listing URLs /l/<slug>/<uuid> are allowed whatever the slug starts with', () => {
    for (const slug of ['heated-backyard-pool', 'new', 'new-heated-pool', 'newport-beach-pool', 'p', 'edit', 'draft', 'checkout', 'pending-approval', 'sale', 'order', 'preview', 'account', 's']) {
      assert.equal(isAllowed(proposed, 'Googlebot', `/l/${slug}/${UUID}`), true, slug);
    }
  });
  test(
    'LIVE: every <loc> in today\'s sitemap.xml, its children and public-pools.xml is allowed (set ROBOTS_LIVE=1)',
    { skip: process.env.ROBOTS_LIVE !== '1' && 'set ROBOTS_LIVE=1 to fetch the live sitemaps (read-only)', timeout: 120_000 },
    async () => {
      const origin = 'https://www.poolrentalnearme.com';
      const { sitemaps, locs } = await fetchAllLocs(`${origin}/sitemap.xml`, { extra: proposed.sitemaps });
      assert.ok(sitemaps.length >= 2 && locs.length > 1000, `${sitemaps.length} sitemaps, ${locs.length} URLs`);
      assert.deepEqual(locs.filter((u) => !u.startsWith(`${origin}/`)), [], 'URLs on another origin');
      for (const agent of [...AGENTS, 'GPTBot']) {
        const blocked = locs.filter((u) => !isAllowed(proposed, agent, u));
        assert.equal(blocked.length, 0, `${agent}: ${blocked.length} of ${locs.length} blocked`);
      }
      const liveBlocked = locs.filter((u) => !isAllowed(live, 'Googlebot', u));
      console.log(`live sitemaps: ${sitemaps.length} files, ${locs.length} distinct URLs, ${locs.filter((u) => u.startsWith(`${origin}/l/`)).length} listings; blocked by the live file for Googlebot: ${liveBlocked.length}`);
    }
  );
});
