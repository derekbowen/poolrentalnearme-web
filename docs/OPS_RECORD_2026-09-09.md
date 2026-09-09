# Ops record — 2026-09-09

## EAST production patch: fabricated testimonial text removed from the live homepage

**Why.** The live homepage's "Love notes" (`/home/ubuntu/fresh-web/src/components/home-page.tsx`,
the only source of that section; fresh-web is in no git repository) carried text that no recorded
message contains: "My pool paid for our summer." appended to Salty Without The Sharks, and an
entire card attributed to "Trish · Riverside, CA" ("Eight kids, one cannonball contest, and a card
that just worked. I did not touch a thing."). The on-record quote list is `ops/east/tools/cta.js`
(`QUOTES`), where Trish's actual message is "Ok awesome, tysm!!" from Olathe, KS. Hard rule 1.
Derek ordered the removal on 2026-09-09.

**What changed, and nothing else.** Exact-anchor edit, both anchors asserted unique before
writing:

- line 480: `…and it&rsquo;s legit. My pool paid for our summer.”` → `…and it&rsquo;s legit.”`
- line 481: the Trish card removed.

Diff against the backup: 3 lines. Backup:
`/home/ubuntu/fresh-web/src/components/home-page.tsx.bak-quotes-20260909T015503Z`.

**Build and restart.** `sudo -u ubuntu npm run build` (vite, 34 s), then
`sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart fresh-web` (pid 975338, restart count
101). pm2 still carries the four runtime-only credential names after the restart, and the
rebuilt bundles no longer contain the dead Supabase URL that the Sep 2 build had inlined.

**Verified.** Local `:3000` and public `https://www.poolrentalnearme.com/`, both 200, one H1,
`cannonball` 0, `paid for our summer` 0, `Trish` 0, Demarco 1, Salty 1; `/p/hosting` and
`/p/all-locations` 200; zero matches for either string in `dist/`.

**Second patch, 02:04 UTC, on Derek's order.** Same file, same method, backup
`home-page.tsx.bak-quotes2-20260909T020425Z`, 4 diff lines:

- line 479: Demarco now reads exactly as recorded, "I love you guys over at Pool Rental Near Me —
  the founder and co-founder personally called me to make sure I'm all right."
- line 480: Salty now reads "Rock on, Derek. I see your hustle this year and it's legit." (period,
  as Derek confirmed; the em dash is gone).

Rebuilt (41 s), pm2 restarted as ubuntu (pid 976207), four runtime-only credential names still
present. Verified on local `:3000` and on the public URL after HTML-entity decoding: both quotes
match character for character; "was all right", "Rock on, Derek —", "cannonball", "paid for our
summer" and "Trish" all 0; one H1; `/p/hosting` and `/p/all-locations` 200.

**Still differing from Derek's confirmed wording, not on EAST:** `ops/east/tools/cta.js` line 210
(served by WEST as the site-wide ticker) carries Salty with an em dash. One-line change plus the
WEST file install when Derek says so.

**Rollback.** `cp` the backup over the file, rebuild, restart (exact command printed in the
session).

## Related, not on EAST

The marketplace homepage branch `claude/prnm-homepage-v4-winter` received the verbatim
testimonials, the honest listing count copy and keyword-search chips in commits `97ae32a`
and `5588dc4` (see `docs/HOMEPAGE_V4_FOLLOWUPS.md` on that branch). v4 is not deployed.
