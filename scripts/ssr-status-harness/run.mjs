#!/usr/bin/env bun
/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop, import/no-extraneous-dependencies */
/**
 * SSR status harness: which HTTP status, headers and robots meta does a route
 * get when the listing fetch succeeds, fails, or says "no"?
 *
 * The component tests under src/ cannot run in this repo (jest has no JSX /
 * ESM transform), and the pure rules in server/api-util/ssrStatus.test.js do
 * not prove that the React pages actually raise the signals those rules read.
 * This closes the gap without touching the network: it builds the app's real
 * server entry with one alias ('sharetribe-flex-sdk' -> src/fakeSdk.js), renders
 * each route through renderApp with a scripted Marketplace API, and applies
 * the server's own decision (ssrStatus.resolveRenderOutcome) at the same
 * moment server/renderer.js does (onShellReady).
 *
 * Run it with Bun, the runtime the server uses (Node rejects the build's
 * named imports from CommonJS packages):
 *
 *   bun scripts/ssr-status-harness/run.mjs            # build, render, assert
 *   bun scripts/ssr-status-harness/run.mjs --no-build # reuse the last build
 *   bun scripts/ssr-status-harness/run.mjs --out <dir> --dump <file.json>
 *
 * --out must sit somewhere `node_modules` resolves from (default:
 * dist/ssr-status-harness, which is git- and docker-ignored). --dump writes
 * every result, bodies included, for a before/after diff between two trees.
 *
 * Exit code 0 only when every scenario matches its expected row. It makes no
 * network request and reads no .env file values beyond what Vite always does.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const argValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const outDir = path.resolve(argValue('--out') || path.join(repoRoot, 'dist/ssr-status-harness'));
const dumpFile = argValue('--dump');

if (!argv.includes('--no-build')) {
  const built = spawnSync(
    path.join(repoRoot, 'node_modules/.bin/vite'),
    [
      'build',
      '--config',
      path.join(here, 'vite.config.mjs'),
      '--ssr',
      path.join(here, 'src/entry.jsx'),
      '--outDir',
      outDir,
      '--logLevel',
      'error',
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VITE_ENV: 'production',
        VITE_MARKETPLACE_ROOT_URL: 'https://www.example.test',
        VITE_MARKETPLACE_NAME: 'Harness',
        VITE_SHARETRIBE_SDK_CLIENT_ID: 'harness',
      },
    }
  );
  if (built.status !== 0) {
    console.error('harness build failed');
    process.exit(2);
  }
}

const { renderApp, getHostedConfiguration, ssrStatus } = await import(
  pathToFileURL(path.join(outDir, 'entry.js')).href
);

// ---------------------------------------------------------------------------
// The scripted Marketplace API
// ---------------------------------------------------------------------------

// src/config/configDefault.js appCdnAssets, path -> name.
const ASSET_NAME_BY_PATH = {
  '/content/translations.json': 'translations',
  '/content/footer.json': 'footer',
  '/content/top-bar.json': 'topbar',
  '/design/branding.json': 'branding',
  '/design/layout.json': 'layout',
  '/users/user-types.json': 'userTypes',
  '/users/user-fields.json': 'userFields',
  '/listings/listing-categories.json': 'categories',
  '/listings/listing-types.json': 'listingTypes',
  '/listings/listing-fields.json': 'listingFields',
  '/listings/listing-search.json': 'search',
  '/transactions/minimum-transaction-size.json': 'transactionSize',
  '/integrations/analytics.json': 'analytics',
  '/integrations/google-search-console.json': 'googleSearchConsole',
  '/integrations/map.json': 'maps',
  '/general/localization.json': 'localization',
  '/general/access-control.json': 'accessControl',
};

// Made-up ids. No real listing, host or guest appears in this file.
const LISTING_ID = '689d6690-2fad-40ab-bf82-f89b07771533';
const AUTHOR_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_ID = '99999999-2222-4333-8444-555555555555';
const PERMISSIONS_ID = '77777777-2222-4333-8444-555555555555';
const CANON = `/l/the-orange-grove-lagoon/${LISTING_ID}`;

// The shape the SDK rejects with: an Error carrying status and data.errors.
const sdkError = (status, errors = []) => {
  const e = new Error(status ? `Request failed with status code ${status}` : 'Network Error');
  e.name = 'AxiosError';
  if (status) {
    e.status = status;
    e.statusText = '';
    e.data = { errors };
  }
  return e;
};
const API_ERROR = {
  404: () => sdkError(404, [{ status: 404, code: 'not-found', title: 'Not found.' }]),
  403: () => sdkError(403, [{ status: 403, code: 'forbidden', title: 'Forbidden.' }]),
  // What production answered on 2026-11-15 for /l/fargo-nd.
  400: (id) =>
    sdkError(400, [
      {
        status: 400,
        code: 'validation-invalid-value',
        title: 'Invalid value.',
        details: `(not (instance? java.util.UUID "${id}"))`,
        source: { path: ['id'], type: 'query' },
      },
    ]),
  500: () => sdkError(500, [{ status: 500, code: 'internal-server-error' }]),
  429: () => sdkError(429, [{ status: 429, code: 'too-many-requests' }]),
  network: () => sdkError(null),
  // A 403 that is not the Marketplace API's own answer: an edge or WAF in
  // front of it, or a suspended client credential. HTML body, no data.errors.
  '403-edge': () => {
    const e = sdkError(403);
    e.data = '<html><body>Forbidden</body></html>';
    return e;
  },
};

const makeSdkFactory = (scn, unstubbed) => (config, real) => {
  const { UUID, Money, LatLng } = real.types;
  const hosted = getHostedConfiguration();
  hosted.layout = { ...hosted.layout, listingPage: { variantType: scn.variantType || 'carousel' } };
  if (scn.privateMarketplace) {
    hosted.accessControl = { marketplace: { private: true } };
  }
  const ok = (data, included = []) =>
    Promise.resolve({ status: 200, data: { data, included, meta: {} } });
  const user = (id, name) => ({
    id: new UUID(id),
    type: 'user',
    attributes: {
      banned: false,
      deleted: false,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      profile: {
        displayName: name,
        abbreviatedName: name.slice(0, 2),
        bio: 'Harness person.',
        publicData: {},
        metadata: {},
      },
    },
    relationships: { profileImage: { data: null } },
  });
  const publicData = {
    listingType: 'daily-booking',
    transactionProcessAlias: 'default-booking/release-1',
    unitType: 'day',
    location: { address: 'Los Angeles, CA, USA' },
  };
  const listing = (type, state, pd) => ({
    id: new UUID(LISTING_ID),
    type,
    attributes: {
      title: 'The Orange Grove Lagoon',
      description: 'A harness pool.',
      geolocation: new LatLng(34.05, -118.24),
      price: new Money(5000, 'USD'),
      state,
      deleted: false,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      availabilityPlan: {
        type: 'availability-plan/time',
        timezone: 'America/Los_Angeles',
        entries: [],
      },
      publicData: pd,
      metadata: {},
    },
    relationships: {
      author: { data: { id: new UUID(AUTHOR_ID), type: 'user' } },
      images: { data: [] },
    },
  });
  const showListing = (type) => (params) => {
    const mode = type === 'ownListing' ? scn.ownListing : scn.listing;
    const author = [user(AUTHOR_ID, 'Harness Host')];
    if (
      mode === 'published' ||
      mode === 'closed' ||
      mode === 'draft' ||
      mode === 'pendingApproval'
    ) {
      return ok(listing(type, mode, publicData), author);
    }
    if (mode === 'invalid') {
      return ok(listing(type, 'published', { location: publicData.location }), author);
    }
    if (mode === 400) {
      return Promise.reject(API_ERROR[400](params.id.uuid));
    }
    return Promise.reject((API_ERROR[mode] || API_ERROR[500])());
  };
  const assets = ({ paths }) =>
    Promise.resolve({
      data: {
        data: paths.map((p) => {
          const name = ASSET_NAME_BY_PATH[p];
          return {
            id: p,
            type: 'jsonAsset',
            attributes: {
              assetPath: p,
              data: hosted[name] ?? (name === 'translations' ? {} : undefined),
            },
          };
        }),
        included: [],
        meta: { version: 'harness' },
      },
    });
  const currentUser = () => {
    const u = user(scn.loggedInAs, 'Logged In');
    u.type = 'currentUser';
    u.attributes = {
      ...u.attributes,
      email: 'harness@example.test',
      emailVerified: true,
      state: 'active',
      stripeConnected: true,
      profile: {
        ...u.attributes.profile,
        firstName: 'Logged',
        lastName: 'In',
        protectedData: {},
        privateData: {},
      },
    };
    u.relationships = {
      ...u.relationships,
      effectivePermissionSet: { data: { id: new UUID(PERMISSIONS_ID), type: 'permissionSet' } },
    };
    return ok(u, [
      {
        id: new UUID(PERMISSIONS_ID),
        type: 'permissionSet',
        attributes: {
          read: 'permission/allow',
          initiateTransactions: 'permission/allow',
          postListings: 'permission/allow',
        },
      },
    ]);
  };
  const known = {
    authInfo: () =>
      Promise.resolve(
        scn.loggedInAs
          ? { isAnonymous: false, scopes: ['user'] }
          : { isAnonymous: true, scopes: ['public-read'] }
      ),
    assetsByAlias: assets,
    assetsByVersion: assets,
    assetByAlias: ({ path: p }) => assets({ paths: [p] }),
    assetByVersion: ({ path: p }) => assets({ paths: [p] }),
    listings: {
      show: showListing('listing'),
      // The one query SSR makes on every request is the "admin listing" that
      // carries the advantages list; everything else gets an empty result.
      query: (params) =>
        params && params.pub_listingType
          ? ok([
              {
                id: new UUID(OTHER_ID),
                type: 'listing',
                attributes: { publicData: { advantages: [] } },
              },
            ])
          : ok([]),
    },
    ownListings: { show: showListing('ownListing'), query: () => ok([]) },
    reviews: { query: () => ok([]) },
    timeslots: { query: () => ok([]) },
    transactions: { query: () => ok([]) },
    users: {
      show: (params) =>
        scn.user === 'ok'
          ? ok(user(params.id.uuid, 'Profile Person'))
          : Promise.reject((API_ERROR[scn.user] || API_ERROR[404])()),
    },
    currentUser: {
      show: () => (scn.loggedInAs ? currentUser() : Promise.reject(sdkError(401))),
    },
  };
  // Anything a page calls that is not scripted above fails loudly and is
  // reported, so a new SDK call cannot silently change what a scenario tests.
  const wrap = (obj, prefix) =>
    new Proxy(obj, {
      get(target, prop) {
        if (prop in target) {
          const v = target[prop];
          return v && typeof v === 'object' ? wrap(v, `${prefix}${String(prop)}.`) : v;
        }
        if (typeof prop === 'symbol' || prop === 'then') {
          return undefined;
        }
        return wrap(
          Object.assign(() => {
            unstubbed.push(`${prefix}${String(prop)}()`);
            return Promise.reject(API_ERROR[500]());
          }, {}),
          `${prefix}${String(prop)}.`
        );
      },
    });
  return wrap(known, '');
};

// ---------------------------------------------------------------------------
// One render
// ---------------------------------------------------------------------------

const render = async (scn) => {
  const unstubbed = [];
  global.harnessSdk = makeSdkFactory(scn, unstubbed);
  const req = {
    protocol: 'https',
    originalUrl: scn.url,
    url: scn.url,
    path: scn.url.split('?')[0],
    method: 'GET',
    headers: {},
    cookies: {},
    get: () => 'www.example.test',
  };
  const res = { locals: {}, on() {}, once() {}, cookie() {}, clearCookie() {} };
  const chunks = [];
  const sink = new Writable({
    write(chunk, enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  const errors = [];
  let shellStatus = 200;
  let outcome = null;
  let app = null;
  await new Promise((resolve, reject) => {
    renderApp({
      req,
      res,
      options: {
        onShellError(e) {
          shellStatus = 500;
          errors.push(`shell: ${e && e.message}`);
          resolve();
        },
        onShellReady() {
          // The moment server/renderer.js decides status, redirect and headers.
          outcome = ssrStatus.resolveRenderOutcome(req, res.locals, shellStatus);
        },
        onAllReady() {
          app.pipe(sink);
          sink.on('finish', resolve);
        },
        onError(e) {
          errors.push(`render: ${e && e.message}`);
        },
      },
    })
      .then((a) => {
        app = a;
      })
      .catch(reject);
  });
  if (!outcome) {
    outcome = ssrStatus.resolveRenderOutcome(req, res.locals, shellStatus);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  const { helmet } = app.helmetContext;
  const meta = helmet ? helmet.meta.toString() : '';
  const head = helmet
    ? helmet.title.toString() + meta + helmet.link.toString() + helmet.script.toString()
    : '';
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  let ui = 'page';
  if (/_number_[^"]*">404</.test(body)) {
    ui = 'not-found page';
  } else if (/_errorText_/.test(body)) {
    ui = 'error page';
  } else if (body.length < 400) {
    ui = 'empty shell';
  }
  const { 'Content-Type': contentType, ...extraHeaders } = outcome.headers;
  return {
    name: scn.name,
    url: scn.url,
    status: outcome.status,
    redirectTo: outcome.redirectTo,
    contentType: contentType || null,
    headers: extraHeaders,
    metaRobots: (meta.match(/name="robots" content="([^"]*)"/) || [])[1] || null,
    title: helmet ? (helmet.title.toString().match(/>([^<]*)</) || [])[1] || '' : '',
    canonical: (head.match(/rel="canonical" href="([^"]*)"/) || [])[1] || null,
    ui,
    bodySha: sha(body),
    headSha: sha(head),
    unstubbed: [...new Set(unstubbed)],
    errors,
    body,
  };
};

// ---------------------------------------------------------------------------
// The behaviour table
// ---------------------------------------------------------------------------

const INDEX = 'index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large';
const OK = { status: 200, redirectTo: null, headers: {}, metaRobots: INDEX, ui: 'page' };
const MOVED = {
  status: 301,
  redirectTo: CANON,
  headers: { 'Cache-Control': 'public, max-age=86400' },
};
const NOT_FOUND = {
  status: 404,
  redirectTo: null,
  headers: { 'X-Robots-Tag': 'noindex, follow' },
  metaRobots: 'noindex, nofollow',
  ui: 'not-found page',
};
const UNAVAILABLE = {
  status: 503,
  redirectTo: null,
  headers: { 'Retry-After': '120', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  metaRobots: 'noindex, follow',
  ui: 'error page',
};
const SHELL = { status: 200, redirectTo: null, headers: {}, metaRobots: null, ui: 'empty shell' };

// Every listing scenario runs against both page variants (the hosted layout
// config picks one; production could be switched in Console at any time).
const both = (s) => [
  { ...s, name: `${s.name} [carousel]`, variantType: 'carousel' },
  { ...s, name: `${s.name} [coverPhoto]`, variantType: 'coverPhoto' },
];
const published = { listing: 'published' };
const owner = { loggedInAs: AUTHOR_ID };

const scenarios = [
  // Healthy listings: nothing about them may change.
  ...both({ name: 'healthy listing', url: CANON, ...published, expect: OK }),
  ...both({
    name: 'healthy listing + query',
    url: `${CANON}?ref=host-share`,
    ...published,
    expect: OK,
  }),
  ...both({
    name: 'healthy listing by bare id',
    url: `/l/${LISTING_ID}`,
    ...published,
    expect: MOVED,
  }),
  ...both({
    name: 'healthy listing, stale slug',
    url: `/l/old-title/${LISTING_ID}`,
    ...published,
    expect: MOVED,
  }),
  ...both({
    name: 'closed listing the API still returns',
    url: CANON,
    listing: 'closed',
    expect: OK,
  }),

  // Missing or not viewable: 404, the real not-found page, no redirect.
  ...both({ name: 'missing listing (API 404)', url: CANON, listing: 404, expect: NOT_FOUND }),
  ...both({
    name: 'city slug as id (API 400 on id)',
    url: '/l/fargo-nd',
    listing: 400,
    expect: NOT_FOUND,
  }),
  ...both({
    name: 'slug + non-UUID id (API 400 on id)',
    url: '/l/some-pool/abc',
    listing: 400,
    expect: NOT_FOUND,
  }),
  ...both({ name: 'API 403, anonymous visitor', url: CANON, listing: 403, expect: NOT_FOUND }),
  ...both({
    name: 'API 403, logged-in non-owner',
    url: CANON,
    loggedInAs: OTHER_ID,
    listing: 403,
    expect: NOT_FOUND,
  }),
  ...both({
    name: 'invalid listing (no listingType)',
    url: CANON,
    listing: 'invalid',
    // Not shown as "Page not found": its host gets the specific message.
    expect: { ...NOT_FOUND, metaRobots: 'noindex, follow', ui: 'error page' },
  }),

  // The fetch broke: 503 + Retry-After, the friendly error page, no redirect.
  ...both({ name: 'API 500', url: CANON, listing: 500, expect: UNAVAILABLE }),
  ...both({
    name: 'API 500 by bare id',
    url: `/l/${LISTING_ID}`,
    listing: 500,
    expect: UNAVAILABLE,
  }),
  ...both({
    name: 'API 500, uppercase + trailing slash',
    url: `/L/Old-Title/${LISTING_ID}/`,
    listing: 500,
    expect: UNAVAILABLE,
  }),
  ...both({ name: 'API 429', url: CANON, listing: 429, expect: UNAVAILABLE }),
  // Every listing would 404 at once if this were "not found".
  ...both({
    name: 'API 403 without a Marketplace API error (edge / WAF / credentials)',
    url: CANON,
    listing: '403-edge',
    expect: UNAVAILABLE,
  }),
  ...both({
    name: 'network failure (no status)',
    url: CANON,
    listing: 'network',
    expect: UNAVAILABLE,
  }),

  // Owners and operators on the documented variants.
  ...both({
    name: 'owner: own draft via /draft',
    url: `${CANON}/draft`,
    ...owner,
    ownListing: 'draft',
    expect: OK,
  }),
  ...both({
    name: 'owner: own pending via /pending-approval',
    url: `${CANON}/pending-approval`,
    ...owner,
    ownListing: 'pendingApproval',
    expect: OK,
  }),
  ...both({
    name: 'owner: own closed listing',
    url: CANON,
    ...owner,
    listing: 'closed',
    expect: OK,
  }),
  ...both({
    name: 'owner: /draft while the API is down',
    url: `${CANON}/draft`,
    ...owner,
    ownListing: 500,
    expect: UNAVAILABLE,
  }),
  // Template behaviour, unchanged: someone else's /pending-approval link is
  // sent to the public listing URL by the client.
  ...both({
    name: 'non-owner on /pending-approval',
    url: `${CANON}/pending-approval`,
    loggedInAs: OTHER_ID,
    ownListing: 403,
    expect: SHELL,
  }),
  // Template behaviour, unchanged: on a PRIVATE marketplace an anonymous 403
  // still goes to signup. (Production is a public marketplace.)
  ...both({
    name: 'private marketplace, anonymous 403',
    url: CANON,
    listing: 403,
    privateMarketplace: true,
    expect: SHELL,
  }),

  // /l and /l/: a 404, never a loop, never the homepage.
  { name: 'bare /l', url: '/l', expect: NOT_FOUND },
  { name: '/l/', url: '/l/', expect: NOT_FOUND },
  { name: '/l/new (create-listing entry, unchanged)', url: '/l/new', expect: SHELL },

  // Auth pages.
  {
    name: '/confirm, anonymous direct visit',
    url: '/confirm',
    expect: { ...OK, metaRobots: 'noindex, follow' },
  },
  { name: '/signup (stays indexable)', url: '/signup', expect: OK },
  { name: '/login', url: '/login', expect: { ...OK, metaRobots: 'noindex, follow' } },

  // Profiles: documented, deliberately not changed (indexing decision deferred).
  { name: '/u/<uuid> profile', url: `/u/${AUTHOR_ID}`, user: 'ok', expect: OK },
  {
    name: '/u/<uuid>, no such user (API 404)',
    url: `/u/${AUTHOR_ID}`,
    user: 404,
    expect: NOT_FOUND,
  },
  {
    name: '/u/<uuid>, API 500 (known soft error, not fixed here)',
    url: `/u/${AUTHOR_ID}`,
    user: 500,
    expect: OK,
  },
  { name: 'bare /u (still sends the browser home, not fixed here)', url: '/u', expect: SHELL },

  // Controls.
  { name: 'unknown route', url: '/no-such-route', expect: NOT_FOUND },
  { name: '/s', url: '/s', expect: OK },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const quiet = { log: console.log, error: console.error, warn: console.warn };
const results = [];
for (const scn of scenarios) {
  // The app logs every scripted failure; keep the table readable.
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  let result;
  try {
    result = await render(scn);
  } catch (e) {
    result = { name: scn.name, url: scn.url, crashed: String((e && e.stack) || e).slice(0, 800) };
  }
  Object.assign(console, quiet);
  results.push({ ...result, expect: scn.expect });
}

let failures = 0;
for (const r of results) {
  const problems = [];
  if (r.crashed) {
    problems.push(`crashed: ${r.crashed}`);
  } else {
    for (const [key, want] of Object.entries(r.expect)) {
      if (JSON.stringify(r[key]) !== JSON.stringify(want)) {
        problems.push(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(r[key])}`);
      }
    }
    if (r.status !== 301 && r.contentType !== 'text/html') {
      problems.push(`Content-Type: ${r.contentType}`);
    }
    if (r.unstubbed.length) {
      problems.push(`unscripted SDK calls: ${r.unstubbed.join(', ')}`);
    }
    if (r.errors.length) {
      problems.push(`render errors: ${r.errors.join('; ')}`);
    }
  }
  const headers = r.crashed
    ? ''
    : Object.entries(r.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ') || '-';
  const line = r.crashed
    ? `${r.name} | ${r.url}`
    : `${r.status}${r.redirectTo ? ` -> ${r.redirectTo}` : ''} | ${r.name} | ${headers} | meta robots: ${r.metaRobots} | ${r.ui}`;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${line}`);
  for (const p of problems) {
    console.log(`       ${p}`);
  }
  failures += problems.length ? 1 : 0;
}
console.log(
  `\n${results.length - failures} of ${results.length} scenarios match the behaviour table`
);

if (dumpFile) {
  fs.writeFileSync(path.resolve(dumpFile), JSON.stringify(results, null, 1));
}
process.exit(failures ? 1 : 0);
