// Unit tests for robots-match.mjs. Every case in the first five blocks is an example
// taken from Google's documentation (read 2026-11-15, "Last updated 2026-10-23 UTC"):
// https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
// Run: node --test ops/west/robots/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, selectRules, pathMatches, isAllowed, explain, normalizeAgent, toUrlPath } from './robots-match.mjs';

describe('Google doc: "URL matching based on path values" table', () => {
  const table = [
    ['/', ['/', '/anything', '/a/b?c=d'], []],
    ['/*', ['/', '/anything'], []],
    ['/$', ['/'], ['/anything', '/a/']],
    [
      '/fish',
      ['/fish', '/fish.html', '/fish/salmon.html', '/fishheads', '/fishheads/yummy.html', '/fish.php?id=anything'],
      ['/Fish.asp', '/catfish', '/?id=fish', '/desert/fish'],
    ],
    [
      '/fish*',
      ['/fish', '/fish.html', '/fish/salmon.html', '/fishheads', '/fishheads/yummy.html', '/fish.php?id=anything'],
      ['/Fish.asp', '/catfish', '/?id=fish', '/desert/fish'],
    ],
    ['/fish/', ['/fish/', '/fish/?id=anything', '/fish/salmon.htm'], ['/fish', '/fish.html', '/animals/fish/', '/Fish/Salmon.asp']],
    [
      '/*.php',
      ['/index.php', '/filename.php', '/folder/filename.php', '/folder/filename.php?parameters', '/folder/any.php.file.html', '/filename.php/'],
      ['/', '/windows.PHP'],
    ],
    ['/*.php$', ['/filename.php', '/folder/filename.php'], ['/filename.php?parameters', '/filename.php/', '/filename.php5', '/windows.PHP']],
    ['/fish*.php', ['/fish.php', '/fishheads/catfish.php?parameters'], ['/Fish.PHP']],
  ];
  for (const [rule, matches, misses] of table) {
    test(`rule ${rule}`, () => {
      for (const p of matches) assert.equal(pathMatches(rule, p), true, `${rule} should match ${p}`);
      for (const p of misses) assert.equal(pathMatches(rule, p), false, `${rule} should not match ${p}`);
    });
  }
});

describe('Google doc: "Order of precedence for rules" table', () => {
  const cases = [
    ['https://example.com/page', 'allow: /p\ndisallow: /', 'allow', '/p'],
    ['https://example.com/folder/page', 'allow: /folder\ndisallow: /folder', 'allow', '/folder'],
    ['https://example.com/page.htm', 'allow: /page\ndisallow: /*.htm', 'disallow', '/*.htm'],
    ['https://example.com/page.php5', 'allow: /page\ndisallow: /*.ph', 'allow', '/page'],
    ['https://example.com/', 'allow: /$\ndisallow: /', 'allow', '/$'],
    ['https://example.com/page.htm', 'allow: /$\ndisallow: /', 'disallow', '/'],
  ];
  for (const [url, rules, type, path] of cases) {
    test(`${url} with ${rules.replace('\n', ' + ')} -> ${type}: ${path}`, () => {
      const r = explain(`user-agent: *\n${rules}\n`, 'anybot', url);
      assert.equal(r.rule.type, type);
      assert.equal(r.rule.path, path);
      assert.equal(r.allowed, type === 'allow');
    });
  }
  test('the order of an equal-length allow and disallow does not matter: allow wins', () => {
    assert.equal(isAllowed('user-agent: *\ndisallow: /folder\nallow: /folder\n', 'anybot', '/folder/page'), true);
  });
});

describe('Google doc: "Grouping of lines and rules"', () => {
  const txt = [
    'user-agent: a',
    'disallow: /c',
    '',
    'user-agent: b',
    'disallow: /d',
    '',
    'user-agent: e',
    'user-agent: f',
    'disallow: /g',
    '',
    'user-agent: h',
  ].join('\n');
  test('four distinct groups: a, b, e+f, h', () => {
    const { groups } = parseRobots(txt);
    assert.deepEqual(groups.map((g) => g.agents), [['a'], ['b'], ['e', 'f'], ['h']]);
    assert.deepEqual(groups.map((g) => g.rules.map((r) => r.path)), [['/c'], ['/d'], ['/g'], []]);
  });
  test('e and f share the same rule; a and b do not see it', () => {
    assert.equal(isAllowed(txt, 'e', '/g'), false);
    assert.equal(isAllowed(txt, 'f', '/g'), false);
    assert.equal(isAllowed(txt, 'a', '/g'), true);
    assert.equal(isAllowed(txt, 'a', '/c'), false);
    assert.equal(isAllowed(txt, 'b', '/c'), true);
  });
});

describe('Google doc: "Order of precedence for user agents"', () => {
  const txt = [
    'user-agent: googlebot-news',
    'disallow: /group1',
    '',
    'user-agent: *',
    'disallow: /group2',
    '',
    'user-agent: googlebot',
    'disallow: /group3',
  ].join('\n');
  const groupOf = (ua) => selectRules(parseRobots(txt), ua).rules.map((r) => r.path);
  test('Googlebot News follows group 1', () => assert.deepEqual(groupOf('Googlebot-News'), ['/group1']));
  test('Googlebot (web) follows group 3', () => assert.deepEqual(groupOf('Googlebot'), ['/group3']));
  test('Storebot-Google follows group 2 (no specific group)', () => assert.deepEqual(groupOf('Storebot-Google'), ['/group2']));
  test('another crawler follows group 2', () => assert.deepEqual(groupOf('Otherbot'), ['/group2']));
  test('a related name is not a match: only a specific match counts', () => assert.deepEqual(groupOf('Otherbot-News'), ['/group2']));
  test('googlebot/1.2 and googlebot* are equivalent to googlebot', () => {
    assert.equal(normalizeAgent('googlebot/1.2'), 'googlebot');
    assert.equal(normalizeAgent('googlebot*'), 'googlebot');
    assert.equal(normalizeAgent('GoogleBot'), 'googlebot');
  });
  test('the order of the groups is irrelevant', () => {
    const reordered = 'user-agent: googlebot\ndisallow: /group3\n\nuser-agent: *\ndisallow: /group2\n';
    assert.deepEqual(selectRules(parseRobots(reordered), 'googlebot').rules.map((r) => r.path), ['/group3']);
  });
  test('specific groups and the global group are not combined', () => {
    assert.equal(isAllowed(txt, 'Googlebot', '/group2'), true);
    assert.equal(isAllowed(txt, 'Googlebot', '/group3'), false);
  });
});

describe('Google doc: "Grouping of rules" and the first example on the page', () => {
  test('several groups for one user agent are merged', () => {
    const txt = 'user-agent: googlebot-news\ndisallow: /fish\n\nuser-agent: *\ndisallow: /carrots\n\nuser-agent: googlebot-news\ndisallow: /shrimp\n';
    assert.deepEqual(selectRules(parseRobots(txt), 'googlebot-news').rules.map((r) => r.path), ['/fish', '/shrimp']);
    assert.deepEqual(selectRules(parseRobots(txt), 'otherbot').rules.map((r) => r.path), ['/carrots']);
  });
  test('a sitemap line between two user-agent lines does not split the group', () => {
    const txt = 'user-agent: a\nsitemap: https://example.com/sitemap.xml\n\nuser-agent: b\ndisallow: /\n';
    const parsed = parseRobots(txt);
    assert.deepEqual(parsed.groups.map((g) => g.agents), [['a', 'b']]);
    assert.deepEqual(parsed.sitemaps, ['https://example.com/sitemap.xml']);
    assert.equal(isAllowed(parsed, 'a', '/x'), false);
    assert.equal(isAllowed(parsed, 'b', '/x'), false);
  });
  test('"/includes/" example: blocked for everyone except Googlebot', () => {
    const txt = [
      '# This robots.txt file controls crawling of URLs under https://example.com.',
      'User-agent: *',
      'Disallow: /includes/',
      '',
      'User-agent: Googlebot',
      'Allow: /includes/',
      '',
      'Sitemap: https://example.com/sitemap.xml',
    ].join('\n');
    assert.equal(isAllowed(txt, 'Googlebot', '/includes/a.css'), true);
    assert.equal(isAllowed(txt, 'Otherbot', '/includes/a.css'), false);
    assert.equal(isAllowed(txt, 'Otherbot', '/page'), true);
  });
  test('the "otherbot" sitemap example: sitemap lines are collected and tied to no user agent', () => {
    const txt = [
      'user-agent: otherbot',
      'disallow: /kale',
      '',
      'sitemap: https://example.com/sitemap.xml',
      'sitemap: https://cdn.example.org/other-sitemap.xml',
      'sitemap: https://ja.example.org/テスト-サイトマップ.xml',
    ].join('\n');
    const parsed = parseRobots(txt);
    assert.equal(parsed.sitemaps.length, 3);
    assert.equal(isAllowed(parsed, 'otherbot', '/kale'), false);
    assert.equal(isAllowed(parsed, 'googlebot', '/kale'), true);
  });
});

describe('Syntax rules stated in the documentation', () => {
  test('field names are case-insensitive; spaces around field and value are ignored', () => {
    const txt = '  USER-AGENT :  *  \n  DisAllow :   /private  \n';
    assert.equal(isAllowed(txt, 'bot', '/private/x'), false);
  });
  test('path values are case-sensitive', () => {
    assert.equal(isAllowed('user-agent: *\ndisallow: /fish\n', 'bot', '/Fish'), true);
  });
  test('everything after # is a comment', () => {
    const txt = 'user-agent: * # everyone\ndisallow: /a # not /b\n';
    assert.equal(isAllowed(txt, 'bot', '/a'), false);
    assert.equal(isAllowed(txt, 'bot', '/b'), true);
  });
  test('CR, CR/LF and LF all separate lines; a byte order mark is ignored', () => {
    for (const eol of ['\r', '\r\n', '\n']) {
      const txt = '﻿' + ['user-agent: *', 'disallow: /x'].join(eol) + eol;
      assert.equal(isAllowed(txt, 'bot', '/x'), false, JSON.stringify(eol));
    }
  });
  test('a rule without a path is ignored', () => {
    const parsed = parseRobots('user-agent: *\ndisallow:\n');
    assert.equal(isAllowed(parsed, 'bot', '/anything'), true);
    assert.equal(parsed.ignored[0].reason, 'rule without a path');
  });
  test('rules before the first user-agent line belong to no group and are ignored', () => {
    const parsed = parseRobots('disallow: /early\nuser-agent: *\ndisallow: /late\n');
    assert.equal(isAllowed(parsed, 'bot', '/early'), true);
    assert.equal(isAllowed(parsed, 'bot', '/late'), false);
    assert.equal(parsed.ignored[0].reason, 'rule outside any user-agent group');
  });
  test('crawl-delay is not supported: ignored, and it does not end the group', () => {
    const parsed = parseRobots('user-agent: *\ndisallow: /a\ncrawl-delay: 5\ndisallow: /b\n');
    assert.equal(parsed.groups.length, 1);
    assert.equal(isAllowed(parsed, 'bot', '/b'), false);
    assert.match(parsed.ignored[0].reason, /unsupported field "crawl-delay"/);
  });
  test('a user-agent line after a rule starts a new group, so later rules bind only to it', () => {
    const txt = 'user-agent: *\ndisallow: /a\nuser-agent: lastbot\nallow: /\ndisallow: /only-lastbot/\n';
    assert.equal(isAllowed(txt, 'bot', '/only-lastbot/x'), true);
    assert.equal(isAllowed(txt, 'lastbot', '/only-lastbot/x'), false);
  });
  test('no group applies and no rule matches: crawling is allowed', () => {
    assert.equal(isAllowed('', 'bot', '/x'), true);
    assert.equal(isAllowed('user-agent: somebot\ndisallow: /\n', 'otherbot', '/x'), true);
    assert.equal(isAllowed('user-agent: *\ndisallow: /a\n', 'bot', '/b'), true);
  });
  test('rules are compared with the path and the query; the fragment is not part of the URL fetched', () => {
    assert.equal(toUrlPath('https://example.com/s?a=1&page=2#top'), '/s?a=1&page=2');
    assert.equal(toUrlPath('https://example.com'), '/');
    assert.equal(isAllowed('user-agent: *\ndisallow: /s?*&page=\n', 'bot', 'https://example.com/s?a=1&page=2'), false);
  });
  test('raw UTF-8 in a rule and its percent-encoded form are the same rule', () => {
    const raw = 'user-agent: *\ndisallow: /foo/bar/ツ\n';
    const enc = 'user-agent: *\ndisallow: /foo/bar/%E3%83%84\n';
    for (const txt of [raw, enc]) {
      assert.equal(isAllowed(txt, 'bot', '/foo/bar/%E3%83%84'), false);
      assert.equal(isAllowed(txt, 'bot', '/foo/bar/ツ'), false);
    }
  });
  test('"$" is an end anchor only at the end of a rule; a wildcard can sit before it', () => {
    assert.equal(pathMatches('/p/*-uk$', '/p/hosting-uk'), true);
    assert.equal(pathMatches('/p/*-uk$', '/p/hosting-uk/more'), false);
    assert.equal(pathMatches('/p/*-uk$', '/p/-uk-and-uk'), true);
    assert.equal(pathMatches('/a*b*c$', '/axxbyyc'), true);
    assert.equal(pathMatches('/a*b*c$', '/axxbyycz'), false);
    assert.equal(pathMatches('/a*bc$', '/abc'), true);
    assert.equal(pathMatches('/ab*b$', '/ab'), false);
  });
  test('a list of tokens is tried most specific first, then "*"', () => {
    const txt = 'user-agent: googlebot\ndisallow: /g\n\nuser-agent: *\ndisallow: /star\n';
    assert.equal(selectRules(parseRobots(txt), ['Googlebot-Image', 'Googlebot']).agent, 'googlebot');
    assert.equal(selectRules(parseRobots(txt), ['Somebot-Image', 'Somebot']).agent, '*');
  });
});
