#!/usr/bin/env node
/**
 * Backfill structured minGuests/maxGuests onto price variants (c192).
 *
 * Reads every published listing over the Integration API and, where ALL of a
 * listing's variant names parse as unambiguous guest bands AND the resulting
 * ladder is sound, writes the bounds onto the variants. Everything else is
 * reported for host confirmation, never guessed.
 *
 * Auto-apply requires every one of:
 *   1. every variant name parses (conservative parser - "A-B guests",
 *      "up to N guests", "N guests"; nothing else)
 *   2. no overlapping bands and no gaps between bands
 *   3. price strictly increases with band size - hosts charge more for more
 *      guests, so a "bigger but not pricier" band means the name was probably
 *      not a guest band at all (weekday/weekend twins parse identically!)
 *
 * Rule 3 is what keeps "Weekday 1-10 people" / "Weekend 1-10 people" out:
 * those parse as the same band, trip the overlap check, and the listing lands
 * in the report instead of getting wrong bounds silently.
 *
 * Usage:
 *   node scripts/backfill-guest-bands.js            # dry run (default)
 *   node scripts/backfill-guest-bands.js --apply    # write the clean ones
 *
 * Requires SHARETRIBE_INTEGRATION_SDK_CLIENT_ID/SECRET in the environment.
 * On WEST, run inside the production container where those are set.
 */

/* eslint-disable no-console */
const APPLY = process.argv.includes('--apply');

// Keep in sync with src/util/priceVariantGuests.js (parseGuestBand).
const GUEST_WORD = '(?:guests?|ppl|people|persons?|pax|pp)';
const RANGE_RE = new RegExp(`(\\d{1,3})\\s*(?:-|to|–|—)\\s*(\\d{1,3})\\s*${GUEST_WORD}`, 'i');
const UPTO_RE = new RegExp(`(?:up\\s*to|max(?:imum)?)\\s*(\\d{1,3})\\s*${GUEST_WORD}`, 'i');
const OR_LESS_RE = new RegExp(`(\\d{1,3})\\s*${GUEST_WORD}\\s*or\\s*(?:less|fewer)`, 'i');
const SINGLE_RE = new RegExp(`(?:^|[^\\d])(\\d{1,3})\\s*${GUEST_WORD}`, 'i');

const parseGuestBand = (name) => {
  const str = String(name || '');
  let m = str.match(RANGE_RE);
  if (m) {
    const min = parseInt(m[1], 10);
    const max = parseInt(m[2], 10);
    return min > 0 && max >= min ? { minGuests: min, maxGuests: max } : null;
  }
  m = str.match(UPTO_RE);
  if (m) return { minGuests: 1, maxGuests: parseInt(m[1], 10) };
  m = str.match(OR_LESS_RE);
  if (m) return { minGuests: 1, maxGuests: parseInt(m[1], 10) };
  m = str.match(SINGLE_RE);
  if (m) {
    const n = parseInt(m[1], 10);
    return { minGuests: n, maxGuests: n };
  }
  return null;
};

const ladderIssues = (bands) => {
  const sorted = [...bands].sort((a, b) => a.minGuests - b.minGuests || a.maxGuests - b.maxGuests);
  const issues = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.minGuests <= prev.maxGuests) issues.push(`overlap: "${prev.name}" / "${curr.name}"`);
    else if (curr.minGuests > prev.maxGuests + 1)
      issues.push(`gap: ${prev.maxGuests + 1}-${curr.minGuests - 1}`);
    if (!(Number(curr.priceInSubunits) > Number(prev.priceInSubunits)))
      issues.push(`price not increasing: "${curr.name}" vs "${prev.name}"`);
  }
  return issues;
};

const main = async () => {
  // eslint-disable-next-line global-require
  const sharetribeIntegrationSdk = require('sharetribe-flex-integration-sdk');
  const integrationSdk = sharetribeIntegrationSdk.createInstance({
    clientId: process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID,
    clientSecret: process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET,
  });

  let page = 1;
  let totalPages = 1;
  const clean = [];
  const needsHost = [];
  const untouched = [];

  do {
    const res = await integrationSdk.listings.query(
      { perPage: 100, page, states: ['published'] },
      { allowRawResponse: true }
    );
    const data = res._raw ? res._raw.data : res.data;
    for (const listing of data.data) {
      const publicData = listing.attributes.publicData || {};
      const variants = publicData.priceVariants || [];
      if (variants.length < 2) {
        untouched.push(listing.attributes.title);
        continue;
      }
      if (variants.every((v) => v.minGuests > 0 && v.maxGuests > 0)) {
        untouched.push(`${listing.attributes.title} (already banded)`);
        continue;
      }
      const parsed = variants.map((v) => ({ ...v, band: parseGuestBand(v.name) }));
      const allParsed = parsed.every((p) => !!p.band);
      const bands = parsed
        .filter((p) => p.band)
        .map((p) => ({ ...p.band, name: p.name, priceInSubunits: p.priceInSubunits }));
      const issues = allParsed ? ladderIssues(bands) : ['not all variant names parse'];
      // A ladder that does not start at 1 makes small parties unbookable -
      // almost always a misread name ("5 people or less" once parsed as 5-5),
      // so it goes to the host, never auto-applied.
      if (allParsed && Math.min(...bands.map((b) => b.minGuests)) !== 1) {
        issues.push('ladder does not start at 1 guest');
      }
      if (allParsed && issues.length === 0) {
        clean.push({ listing, parsed });
      } else {
        needsHost.push({ title: listing.attributes.title, id: listing.id.uuid, issues });
      }
    }
    totalPages = data.meta.totalPages;
    page++;
  } while (page <= totalPages);

  console.log(`AUTO-APPLICABLE (${clean.length}):`);
  for (const { listing, parsed } of clean) {
    console.log(`  ${listing.attributes.title}`);
    for (const p of parsed)
      console.log(`     ${p.name} -> ${p.band.minGuests}-${p.band.maxGuests}`);
  }
  console.log(`\nNEEDS HOST CONFIRMATION (${needsHost.length}):`);
  for (const item of needsHost) {
    console.log(`  ${item.title} (${item.id})`);
    for (const issue of item.issues) console.log(`     ${issue}`);
  }
  console.log(`\nUNTOUCHED - fewer than 2 variants or already banded (${untouched.length})`);

  if (!APPLY) {
    console.log(
      '\nDRY RUN - nothing written. Re-run with --apply to write the auto-applicable set.'
    );
    return;
  }

  for (const { listing, parsed } of clean) {
    const publicData = listing.attributes.publicData || {};
    const priceVariants = parsed.map((p) => {
      const { band, ...variant } = p;
      return { ...variant, minGuests: band.minGuests, maxGuests: band.maxGuests };
    });
    await integrationSdk.listings.update({
      id: listing.id,
      publicData: { ...publicData, priceVariants },
    });
    console.log(`APPLIED ${listing.attributes.title}`);
  }
  console.log(`\nApplied ${clean.length} listings.`);
};

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
