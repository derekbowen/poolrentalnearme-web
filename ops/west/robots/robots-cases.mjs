// Shared table for robots.test.mjs (the live file) and robots.proposed.test.mjs.
// One row per URL: what the live www file does today, and what the proposed file is
// meant to do. Googlebot and an unnamed crawler both fall into the "*" group in both
// files, so one expectation covers both.
//
// The UUIDs and slugs below are made up; no real listing or user is referenced.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = (name) => new URL(name, import.meta.url);
export const read = (name) => readFileSync(here(name), 'utf8');
export const sha256 = (name) => createHash('sha256').update(readFileSync(here(name))).digest('hex');
export const lines = (name) => read(name).split('\n').filter(Boolean);

export const LIVE = 'robots.www.poolrentalnearme.com.live.txt';
export const PROPOSED = 'robots.www.poolrentalnearme.com.proposed.txt';
export const FIXTURE = 'fixtures/sitemap-paths.www.poolrentalnearme.com.2026-11-15.txt';
export const CCTLD_FIXTURE = 'fixtures/sitemap-country-urls.cctld.2026-11-15.txt';

// sha256 of the files exactly as fetched on 2026-11-15 (see README.md).
export const LIVE_SHA256 = {
  'robots.www.poolrentalnearme.com.live.txt': '3fa2699ddf1a39e9e044b42b5d44446828cffb11bbe5ef72ad0d7d9e32773cca',
  'robots.poolrentalnearme.co.uk.live.txt': '051608537f92058f8fb15aebb009b630def646a896f0fe19a4019fca382b91e6',
  'robots.www.poolrentalnearme.co.uk.live.txt': '9c90024a61f7b72072f11318e18a4720f23834420d92a08bc3f5230a7da627c1',
  'robots.poolrentalnearme.ca.live.txt': '6fc926f88542cba05112a78d6eabf65eee415423affd8a42e18bcbffa62a1c73',
  'robots.www.poolrentalnearme.ca.live.txt': 'd77855c3758a7651e6574970bf2f855f76e2071a3cb714272d7ca7a52410d2c1',
  'robots.poolrentalnearme.com.au.live.txt': '40a9f6ab09d0abf21b281cda85fcca0be0bb796181b515b3d643312d7f69ee99',
  'robots.www.poolrentalnearme.com.au.live.txt': '7599d061efa088e40b36a79f54179a7898687834e09f60815f88b5382ae94dc6',
};

export const UUID = '11111111-2222-4333-8444-555555555555';
export const LISTING = `/l/heated-backyard-pool/${UUID}`;

const A = 'allow';
const D = 'disallow';

// { path, live, proposed, defect?, edit? }
//   defect: set when the live behaviour is a KNOWN DEFECT of the live file.
//   edit:   the README edit (E1..E6) that changes it, or a note when it is left alone on purpose.
export const CASES = [
  // Public pages: crawlable in both files.
  { path: '/', live: A, proposed: A },
  { path: '/p/hosting', live: A, proposed: A },
  { path: '/public-pools/delaware/dover/', live: A, proposed: A },
  { path: LISTING, live: A, proposed: A },
  { path: `/u/${UUID}`, live: A, proposed: A, edit: 'profile indexing is a deferred decision: not changed' },
  { path: '/riverside', live: A, proposed: A },
  { path: '/login', live: A, proposed: A },
  { path: '/signup', live: A, proposed: A },
  { path: '/confirm', live: A, proposed: A },
  { path: '/sitemap.xml', live: A, proposed: A },
  { path: '/fw-assets/x.js', live: A, proposed: A },
  { path: '/static/x.js', live: A, proposed: A },
  { path: '/assets/index-abc123.js', live: A, proposed: A },

  // Search: every /s?... answers 200 with noindex,follow (header and meta), so it has
  // to be fetchable for the noindex to be read.
  { path: '/s', live: A, proposed: A },
  { path: '/s?address=Austin%2C%20TX', live: A, proposed: A },
  { path: '/s?pub_poolAmenities=hot_tub', live: A, proposed: A },
  {
    path: '/s?page=2',
    live: A,
    proposed: A,
    defect: '"Disallow: /s?*&page=" needs an "&" before "page=", so it does not cover /s?page=N',
    edit: 'left crawlable on purpose: the page answers noindex,follow and must be fetched for that to be read',
  },
  {
    path: '/s?address=X&page=2',
    live: D,
    proposed: D,
    defect: 'blocked although its only protection is a noindex the crawler is not allowed to fetch',
    edit: 'conservative default: rule kept until Search Console data says otherwise (owner decision D1)',
  },
  {
    path: '/s?address=Austin%2C%20TX&bounds=30.5%2C-97.5%2C30.1%2C-97.9&page=3',
    live: D,
    proposed: D,
    defect: 'blocked although its only protection is a noindex the crawler is not allowed to fetch',
    edit: 'conservative default: rule kept until Search Console data says otherwise (owner decision D1)',
  },

  // Redirecting junk URLs.
  { path: '/p/p/anything', live: D, proposed: A, defect: 'hides the 301 from /p/p/x to /p/x from crawlers', edit: 'E2' },
  { path: '/p/p/p/hosting', live: D, proposed: A, defect: 'hides the 301 from /p/p/p/x to /p/x from crawlers', edit: 'E2' },

  // Private and action URLs: blocked in both files.
  { path: '/profile-settings', live: D, proposed: D },
  { path: '/l/new', live: D, proposed: D },
  { path: '/l/new?utm_source=x', live: D, proposed: D },
  { path: '/l/draft/00000000-0000-0000-0000-000000000000/new/details', live: D, proposed: D },
  { path: `${LISTING}/checkout`, live: D, proposed: D },
  { path: `${LISTING}/draft/details`, live: D, proposed: D },
  { path: `${LISTING}/pending-approval`, live: D, proposed: D },
  { path: `${LISTING}/new/details`, live: D, proposed: D },
  { path: `${LISTING}/edit/details`, live: D, proposed: D },
  { path: `${LISTING}/p/hosting`, live: D, proposed: D },
  { path: '/inbox', live: D, proposed: D },
  { path: '/inbox/orders', live: D, proposed: D },
  { path: `/order/${UUID}`, live: D, proposed: D },
  { path: `/sale/${UUID}/details`, live: D, proposed: D },
  { path: '/listings', live: D, proposed: D },
  { path: '/account', live: D, proposed: D },
  { path: '/account/contact-details', live: D, proposed: D },
  { path: '/reset-password', live: D, proposed: D },
  { path: '/reset-password?t=abc&e=x', live: D, proposed: D },
  { path: '/verify-email', live: D, proposed: D },
  { path: '/preview', live: D, proposed: D },
  { path: '/admin', live: D, proposed: D },
  { path: '/admin/dashboard', live: D, proposed: D },
  { path: '/auth', live: D, proposed: D },
  { path: '/auth?redirect=%2Faccount%2Flearning&mode=signin', live: D, proposed: D },
  { path: '/auth/x', live: D, proposed: D },
  { path: '/api/x', live: D, proposed: D },
  { path: '/api/health/booking', live: D, proposed: D },

  // A rule that binds to the wrong group.
  {
    path: '/host/preview/x',
    live: A,
    proposed: D,
    defect: '"Disallow: /host/preview/" comes after "User-agent: CCBot", so it binds to CCBot only',
    edit: 'E1',
  },
  {
    path: '/host/preview/start',
    live: A,
    proposed: D,
    defect: '"Disallow: /host/preview/" comes after "User-agent: CCBot", so it binds to CCBot only',
    edit: 'E1',
  },

  // Rules without a boundary swallow public URLs that merely start the same way.
  {
    path: `/l/new-heated-pool/${UUID}`,
    live: D,
    proposed: A,
    defect: '"Disallow: /l/new" is a prefix: it blocks any listing whose title starts with "New"',
    edit: 'E3',
  },
  {
    path: `/l/newport-beach-pool/${UUID}`,
    live: D,
    proposed: A,
    defect: '"Disallow: /l/new" is a prefix: it blocks any listing whose title starts with "New"',
    edit: 'E3',
  },
  { path: '/author/x', live: D, proposed: A, defect: '"Disallow: /auth" is a prefix: it also blocks /author/...', edit: 'E4' },
  { path: '/salem', live: D, proposed: A, defect: '"Disallow: /sale" is a prefix: it would block a root-level city page such as /salem', edit: 'E6' },
  { path: '/orderville', live: D, proposed: A, defect: '"Disallow: /order" is a prefix: it would block a root-level page such as /orderville', edit: 'E6' },
  { path: '/sale', live: D, proposed: A, edit: 'E6 side effect: bare /sale is not a route (404 + noindex today)' },
  { path: '/order', live: D, proposed: A, edit: 'E6 side effect: bare /order is not a route (404 + noindex today)' },
];

// Crawlers the live file names with nothing but "Allow: /" (each its own group).
export const WELCOME_BOTS = [
  'SemrushBot',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
];
// Crawlers both files block completely.
export const BLOCKED_BOTS = ['MJ12bot', 'AhrefsBot', 'Bytespider', 'Baiduspider', 'Yandex'];
