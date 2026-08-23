#!/usr/bin/env node
/**
 * Validates the ProfilePage JSON-LD that the app actually renders.
 *
 * Guards the Search Console error "Profile page structured data: Missing field
 * mainEntity". Google requires ProfilePage.mainEntity to be a Person or an
 * Organization; a ProfilePage without it earns a critical error on every
 * profile URL.
 *
 * This reads generated HTML over HTTP, not the schema object in source, so it
 * also catches breakage introduced between the container and the response
 * (duplicate blocks, escaping bugs, a proxy shadowing the route).
 *
 * Usage:
 *   node scripts/validate-profilepage-schema.mjs <userId> [userId...]
 *   PROFILE_SCHEMA_BASE_URL=http://127.0.0.1:4000 node scripts/validate-profilepage-schema.mjs <userId>
 */

const BASE = process.env.PROFILE_SCHEMA_BASE_URL || 'http://127.0.0.1:3000';
const ids = process.argv.slice(2);

if (ids.length === 0) {
  console.error('usage: node scripts/validate-profilepage-schema.mjs <userId> [userId...]');
  process.exit(2);
}

const LD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

const decode = s =>
  s
    .replace(/\\u003c/gi, '<')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'");

const flatten = node => (node && node['@graph'] ? node['@graph'] : [node]);

const failures = [];
const note = (id, msg) => failures.push(`${id}: ${msg}`);

for (const id of ids) {
  const url = `${BASE}/u/${id}`;
  let res;
  try {
    res = await fetch(url, { redirect: 'manual' });
  } catch (e) {
    note(id, `request failed: ${e.message}`);
    continue;
  }

  if (res.status !== 200) {
    note(id, `expected HTTP 200, got ${res.status} (profile pages must be reachable to be indexed)`);
    continue;
  }

  const html = await res.text();
  const title = (html.match(TITLE_RE)?.[1] || '').trim();

  const blocks = [...html.matchAll(LD_RE)].map(m => m[1]);
  if (blocks.length === 0) {
    note(id, 'no JSON-LD block rendered');
    continue;
  }

  const nodes = [];
  blocks.forEach((raw, i) => {
    try {
      nodes.push(...flatten(JSON.parse(decode(raw))));
    } catch (e) {
      note(id, `JSON-LD block ${i} is malformed: ${e.message}`);
    }
  });

  const profilePages = nodes.filter(n => n && n['@type'] === 'ProfilePage');

  if (profilePages.length === 0) {
    note(id, 'no ProfilePage node found');
    continue;
  }
  if (profilePages.length > 1) {
    note(id, `${profilePages.length} ProfilePage nodes rendered - Google reads only one`);
  }

  for (const page of profilePages) {
    const entity = page.mainEntity;
    if (!entity) {
      note(id, 'ProfilePage is missing the required field mainEntity');
      continue;
    }
    if (!['Person', 'Organization'].includes(entity['@type'])) {
      note(id, `mainEntity['@type'] is ${JSON.stringify(entity['@type'])}, expected Person or Organization`);
    }
    if (!entity.name || String(entity.name).trim() === '') {
      note(id, 'mainEntity.name is empty');
    }
    // The person named in the schema must be the person the page is actually about.
    // Catches a placeholder or a stale name surviving into the markup.
    if (entity.name && title && !title.includes(entity.name)) {
      note(id, `mainEntity.name ${JSON.stringify(entity.name)} does not appear in the page title ${JSON.stringify(title)}`);
    }
  }

  const orphanPersons = nodes.filter(
    n => n && n['@type'] === 'Person' && !profilePages.some(p => p.mainEntity === n)
  );
  if (orphanPersons.length > 0) {
    note(id, `${orphanPersons.length} Person node(s) outside mainEntity - possible conflicting schema`);
  }

  if (!failures.some(f => f.startsWith(`${id}:`))) {
    const e = profilePages[0].mainEntity;
    console.log(`  PASS ${url} -> ProfilePage.mainEntity = ${e['@type']} "${e.name}"`);
  }
}

if (failures.length > 0) {
  console.error('\nProfilePage schema validation FAILED:');
  failures.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
}

console.log(`\nProfilePage schema OK for ${ids.length} URL(s).`);
