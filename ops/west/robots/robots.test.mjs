// What the LIVE robots.txt files do today (snapshots fetched 2026-11-15, see README.md).
//
// These tests describe; they do not approve. A test named "KNOWN DEFECT (live file)"
// passes because the live file really behaves that way. The intended behaviour is in
// robots.proposed.test.mjs.
//
// Run: node --test ops/west/robots/*.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, explain, isAllowed, selectRules } from './robots-match.mjs';
import { read, sha256, lines, LIVE, FIXTURE, SITEMAP_FILES_FIXTURE, CCTLD_FIXTURE, LIVE_SHA256, CASES, UUID, LISTING, WELCOME_BOTS, BLOCKED_BOTS } from './robots-cases.mjs';

const live = parseRobots(read(LIVE));
const AGENTS = ['Googlebot', 'ExampleBot'];

describe('snapshots are byte-for-byte what was fetched', () => {
  for (const [file, hash] of Object.entries(LIVE_SHA256)) {
    test(file, () => assert.equal(sha256(file), hash));
  }
});

describe('live www file: structure as Google reads it', () => {
  test('there is no Googlebot group, so Googlebot follows the "*" group', () => {
    assert.equal(selectRules(live, 'Googlebot').agent, '*');
    assert.equal(selectRules(live, 'ExampleBot').agent, '*');
  });
  test('18 groups: 17 named crawlers each with their own group, and "*"', () => {
    assert.equal(live.groups.length, 18);
    assert.ok(live.groups.every((g) => g.agents.length === 1));
    assert.equal(live.groups.filter((g) => g.agents[0] === '*').length, 1);
  });
  test('the "*" group holds 22 rules, from "Allow: /" (line 51) to "Disallow: /s?*&page=" (line 87)', () => {
    const { rules } = selectRules(live, 'Googlebot');
    assert.equal(rules.length, 22);
    assert.deepEqual([rules[0].type, rules[0].path, rules[0].line], ['allow', '/', 51]);
    assert.deepEqual([rules.at(-1).type, rules.at(-1).path, rules.at(-1).line], ['disallow', '/s?*&page=', 87]);
  });
  test('Crawl-Delay (line 82) is the only ignored line; it does not end the "*" group', () => {
    assert.deepEqual(live.ignored, [{ line: 82, text: 'Crawl-Delay: 5', reason: 'unsupported field "crawl-delay"' }]);
  });
  test('two Sitemap lines; neither URL is disallowed for Googlebot', () => {
    assert.deepEqual(live.sitemaps, ['https://www.poolrentalnearme.com/sitemap.xml', 'https://www.poolrentalnearme.com/public-pools.xml']);
    for (const s of live.sitemaps) assert.equal(isAllowed(live, 'Googlebot', s), true);
  });
});

describe('live www file: Googlebot and an unnamed crawler', () => {
  for (const c of CASES) {
    const label = c.defect ? `KNOWN DEFECT (live file): ${c.path} is ${c.live}ed — ${c.defect}` : `${c.path} is ${c.live}ed`;
    test(label, () => {
      for (const agent of AGENTS) {
        const r = explain(live, agent, c.path);
        assert.equal(r.allowed ? 'allow' : 'disallow', c.live, `${agent} ${c.path} (rule: ${r.rule?.type} ${r.rule?.path})`);
      }
    });
  }
});

describe('live www file: which rule decides', () => {
  const winner = (p) => {
    const r = explain(live, 'Googlebot', p).rule;
    return `${r.type}: ${r.path}`;
  };
  test('public pages are allowed by "Allow: /"', () => assert.equal(winner('/p/hosting'), 'allow: /'));
  test('checkout is blocked by "/l/*/checkout"', () => assert.equal(winner(`${LISTING}/checkout`), 'disallow: /l/*/checkout'));
  test('/s?address=X&page=2 is blocked by "/s?*&page="', () => assert.equal(winner('/s?address=X&page=2'), 'disallow: /s?*&page='));
  test('KNOWN DEFECT (live file): /author/x is blocked by "/auth"', () => assert.equal(winner('/author/x'), 'disallow: /auth'));
  test('KNOWN DEFECT (live file): /p/p/anything is blocked by "/p/p/"', () => assert.equal(winner('/p/p/anything'), 'disallow: /p/p/'));
  test('KNOWN DEFECT (live file): a listing whose slug starts with "new" is blocked by "/l/new"', () =>
    assert.equal(winner(`/l/new-heated-pool/${UUID}`), 'disallow: /l/new'));
});

describe('live www file: named crawlers', () => {
  test('KNOWN DEFECT (live file): "Disallow: /host/preview/" (last line) binds to CCBot and nobody else', () => {
    const rule = explain(live, 'CCBot', '/host/preview/x').rule;
    assert.deepEqual([rule.type, rule.path, rule.line], ['disallow', '/host/preview/', 97]);
    for (const agent of [...AGENTS, ...WELCOME_BOTS.filter((b) => b !== 'CCBot')]) {
      assert.equal(isAllowed(live, agent, '/host/preview/x'), true, agent);
    }
  });
  for (const bot of WELCOME_BOTS) {
    test(`KNOWN DEFECT (live file): ${bot} has its own "Allow: /" group, so no private-URL rule applies to it`, () => {
      assert.equal(selectRules(live, bot).agent, bot.toLowerCase());
      for (const p of [`${LISTING}/checkout`, `${LISTING}/edit/details`, '/account', '/inbox', '/admin', '/api/x', '/reset-password']) {
        assert.equal(isAllowed(live, bot, p), true, `${bot} ${p}`);
      }
      // CCBot's group is not only "Allow: /": it also carries the last line of the file.
      assert.equal(isAllowed(live, bot, '/host/preview/x'), bot !== 'CCBot', `${bot} /host/preview/x`);
    });
  }
  for (const bot of BLOCKED_BOTS) {
    test(`${bot} is blocked from everything`, () => {
      for (const p of ['/', '/p/hosting', LISTING, '/s']) assert.equal(isAllowed(live, bot, p), false, `${bot} ${p}`);
    });
  }
});

describe('live www file: sitemap URLs (snapshot of 2026-11-15, listing URLs left out)', () => {
  const paths = lines(FIXTURE);
  test('the fixture holds 9,948 paths and no listing URL', () => {
    assert.equal(paths.length, 9948);
    assert.equal(paths.filter((p) => p.startsWith('/l/')).length, 0);
  });
  test('no sitemap URL is blocked for Googlebot or an unnamed crawler', () => {
    for (const agent of AGENTS) {
      const blocked = paths.filter((p) => !isAllowed(live, agent, p));
      assert.deepEqual(blocked, [], `${agent}: ${blocked.length} blocked`);
    }
  });
  test('no sitemap FILE (/sitemap.xml and the 15 children its index lists) is blocked', () => {
    const files = lines(SITEMAP_FILES_FIXTURE);
    assert.equal(files.length, 16);
    for (const agent of AGENTS) {
      assert.deepEqual(files.filter((p) => !isAllowed(live, agent, p)), [], agent);
    }
  });
});

describe('ccTLD files (generated by the other app; recorded here, not edited here)', () => {
  const hosts = {
    'poolrentalnearme.co.uk': { ok: ['/p/hosting-uk', '/p/rent-out-your-pool-united-kingdom', '/p/rent-out-your-pool-london'], no: ['/p/hosting-uk/x', '/p/rent-out-your-pool-london-ontario'] },
    'poolrentalnearme.ca': { ok: ['/p/hosting-canada', '/p/canadian-cities-with-pools', '/p/rent-out-your-pool-toronto'], no: ['/p/hosting-canada/x', '/p/rent-out-your-pool-toronto-oh'] },
    'poolrentalnearme.com.au': { ok: ['/p/hosting-australia', '/p/australian-cities-with-pools', '/p/rent-out-your-pool-melbourne'], no: ['/p/hosting-australia/x', '/p/rent-out-your-pool-melbourne-fl'] },
  };
  const countryUrls = lines(CCTLD_FIXTURE);
  for (const [bare, { ok, no }] of Object.entries(hosts)) {
    for (const host of [bare, `www.${bare}`]) {
      const text = read(`robots.${host}.live.txt`);
      const parsed = parseRobots(text);
      test(`${host}: one "*" group; everything is blocked except this country's pages`, () => {
        assert.deepEqual(parsed.groups.map((g) => g.agents), [['*']]);
        assert.deepEqual(parsed.ignored, []);
        for (const p of ['/', '/p/hosting', '/s', LISTING, '/public-pools/delaware/', '/login', ...no]) {
          assert.equal(isAllowed(parsed, 'Googlebot', p), false, p);
        }
        for (const p of ok) assert.equal(isAllowed(parsed, 'Googlebot', p), true, p);
      });
      test(`${host}: the Sitemap line points at /sitemap-country.xml on its own origin`, () => {
        assert.deepEqual(parsed.sitemaps, [`https://${host}/sitemap-country.xml`]);
      });
      test(`KNOWN DEFECT (ccTLD file, other app): ${host} disallows the sitemap its own Sitemap line names`, () => {
        // Google: a sitemap "may be followed by all crawlers, provided it isn't disallowed for crawling".
        const r = explain(parsed, 'Googlebot', parsed.sitemaps[0]);
        assert.equal(r.allowed, false);
        assert.equal(`${r.rule.type}: ${r.rule.path}`, 'disallow: /');
      });
      test(`${host}: every URL in its sitemap-country.xml (2026-11-15) is allowed`, () => {
        const own = countryUrls.filter((u) => u.startsWith(`https://${host}/`));
        assert.ok(own.length >= 19, `${own.length} URLs`);
        assert.deepEqual(own.filter((u) => !isAllowed(parsed, 'Googlebot', u)), []);
      });
    }
    test(`${bare}: the bare and www files differ only in the Sitemap line`, () => {
      const strip = (t) => t.split('\n').filter((l) => !l.startsWith('Sitemap:')).join('\n');
      assert.equal(strip(read(`robots.${bare}.live.txt`)), strip(read(`robots.www.${bare}.live.txt`)));
    });
  }
});

describe('reference: the marketplace app\'s own robots.txt (server/resources/robots.txt) — NOT what www serves', () => {
  // nginx answers /robots.txt on www from a static file, so this template is never
  // reached there. These tests record what would change if it ever were.
  const app = parseRobots(read('../../../server/resources/robots.txt'));
  test('it is a different file from the live one: one "*" group, and a placeholder sitemap URL', () => {
    assert.deepEqual(app.groups.map((g) => g.agents), [['*']]);
    assert.deepEqual(app.sitemaps, ['https://my.marketplace.com/sitemap-index.xml']);
    assert.notEqual(read('../../../server/resources/robots.txt'), read(LIVE));
  });
  test('it blocks the whole search route, bare /s included (the live file allows it)', () => {
    for (const p of ['/s', '/s?address=Austin%2C%20TX', '/s?page=2']) {
      assert.equal(isAllowed(app, 'Googlebot', p), false, p);
    }
    assert.equal(isAllowed(live, 'Googlebot', '/s'), true);
  });
  test('KNOWN DEFECT (app template): "Disallow: /s" is a prefix, so it also blocks /sitemap.xml, /signup and /static/', () => {
    for (const p of ['/sitemap.xml', '/sitemap-index.xml', '/signup', '/static/x.js']) {
      const r = explain(app, 'Googlebot', p);
      assert.equal(r.allowed, false, p);
      assert.equal(r.rule.path, '/s');
    }
  });
  test('it has no rule for a named crawler, so the crawlers the live file blocks would be let in', () => {
    for (const bot of BLOCKED_BOTS) assert.equal(isAllowed(app, bot, '/'), true, bot);
  });
});
