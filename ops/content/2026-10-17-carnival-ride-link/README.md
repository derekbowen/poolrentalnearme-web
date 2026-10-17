# Editorial link to Carnival Ride Rental (2026-10-17) — APPLIED

**Applied** 2026-10-17 15:39:27 UTC by Derek in the Supabase SQL editor with `apply_paste_safe.sql`.
- Row md5 is now `be8daa24…`, identical to `after.md`.
- `verify.py` passed: canonical, H2s and JSON-LD unchanged; the new H3 and exactly one
  `<a href="https://carnivalriderental.us/">Carnival Ride Rental</a>` present.
- `Article.dateModified` is now `2026-10-17T15:39:27.465Z`.

**Article:** https://www.poolrentalnearme.com/p/how-to-host-a-pool-party
(Supabase `qbzpjsiahqgyoazjurqy`, table `blog_posts`, id `4896391d-5f21-457f-bedb-2c9b5a4b7f5f`, markdown in `content`).

**What changes:** one H3 subsection, `section.md`, is added at the end of "## 5. Entertainment Beyond the Water", just before the FAQ.
- It contains exactly one link, to https://carnivalriderental.us/.
- Every existing heading, the canonical and the JSON-LD blocks stay the same.
- No template, footer, navigation or listing change.

**Why this page:** it is the general "plan a party at a pool" guide, it already has an entertainment section, and it speaks to party planners as well as hosts. The narrower birthday and kids pages were candidates too. The copy says rides belong at parks, fairgrounds and event grounds, not at a typical backyard pool rental.

**Destination check (2026-10-17, Firecrawl):**
- HTTP 200, robots `index, follow`.
- The site describes itself as listing rides from independent operators and connecting organizers with them.
- It is owned by 10000 Solutions LLC, the same owner as PRNM.

**Review:** three independent reviewers looked at the copy (requirements, accuracy and house rules, editorial). Their fixes are applied. The copy has no insurance wording, no statistics and no named people.

## Apply / verify / undo

1. Run `apply.sql` in the Supabase SQL editor; it should return 1 row.
   - It is guarded: it applies only if the row still matches `before.md` (md5 `9f550652…`), and only if the result matches `after.md` (md5 `be8daa24…`).
   - If it returns 0 rows, the article changed since the backup was taken; nothing was written.
2. Run `python3 -I verify.py`.
   - Expected: canonical, H2s and JSON-LD unchanged; the new H3 and exactly one carnival link present.
   - `Article.dateModified` moves to the time of the update, set by the `set_updated_blog` trigger.
   - The page is DB-driven SSR on EAST, so no build or deploy is needed. Cloudflare revalidates it (`cf-cache-status: EXPIRED`).
3. Undo with `rollback.sql`. It is guarded the same way in reverse and restores `before.md` byte for byte.

**Why it was applied by hand:** the Supabase connector in the Claude session ran reads, and a zero-row update, instantly. Both attempts at the real update timed out at 60 s with no change and nothing left running or locked. That looks like a write confirmation that was never answered.
