#!/usr/bin/env python3
"""
Split a Search Console click change into demand, ranking, CTR/SERP,
query-mix, lost/new queries and indexation/URL change.

Input: the zip GSC produces from Performance -> Date -> Compare -> Export
(one for "last 28 days vs previous 28 days", one for "vs same period last
year"). Its Queries.csv / Pages.csv carry both periods side by side:
    Top queries, Last 28 days Clicks, Previous 28 days Clicks,
    Last 28 days Impressions, ..., Last 28 days Position, Previous 28 days Position
Column names vary with the chosen ranges, so periods are detected by the
"Clicks" header prefixes rather than hard-coded.

Method, per query present in both periods (A = earlier, B = later):
    impression effect = (imprB - imprA) * ctrA
        -> "ranking" when position worsened by more than POS_TOL,
           otherwise "demand" (same rank, fewer searches shown)
    CTR effect        = imprB * (ctrB - ctrA)
        -> the part explained by the position change, using the site's own
           CTR-by-position curve from period A, is "ranking"; the remainder
           is "CTR/SERP" (snippet, SERP features, AI answers)
Queries that vanish are "lost queries", new ones "new queries". The gap
between the sitewide CTR change and the sum of within-query changes is
"query mix". Pages: every page that lost clicks is checked live; if it no
longer returns an indexable 200, its loss is "indexation/URL change".

The GSC UI exports the top 1000 rows only, so the report states how much
of the total change the rows cover.

Usage: python3 ops/seo/gsc_compare.py <compare.zip> [--no-live]
"""
import csv, io, re, sys, zipfile, urllib.request, collections

POS_TOL = 1.0


def num(s):
    s = (s or '').strip().replace(',', '').replace('%', '')
    try:
        return float(s)
    except ValueError:
        return 0.0


def read(z, name):
    hit = [n for n in z.namelist() if n.lower().endswith(name.lower())]
    if not hit:
        return None, None
    rows = list(csv.DictReader(io.TextIOWrapper(z.open(hit[0]), encoding='utf-8-sig')))
    if not rows:
        return None, None
    heads = list(rows[0].keys())
    per = [h[: -len(' Clicks')] for h in heads if h.endswith(' Clicks')]
    if len(per) != 2:
        raise SystemExit(f'{name}: expected two periods, got columns {heads}')
    return rows, per


def periods(per):
    # GSC lists the later period first ("Last 28 days", then "Previous 28 days").
    later, earlier = per[0], per[1]
    return earlier, later


def ctr_curve(rows, A):
    buckets = collections.defaultdict(lambda: [0.0, 0.0])
    for r in rows:
        p = num(r[f'{A} Position'])
        if p <= 0:
            continue
        b = min(int(p), 30)
        buckets[b][0] += num(r[f'{A} Clicks'])
        buckets[b][1] += num(r[f'{A} Impressions'])
    curve = {b: (c / i if i else 0.0) for b, (c, i) in buckets.items()}

    def at(p):
        if p <= 0:
            return 0.0
        b = min(int(p), 30)
        while b > 1 and b not in curve:
            b -= 1
        return curve.get(b, 0.0)
    return at


def decompose(rows, key, A, B):
    at = ctr_curve(rows, A)
    out = collections.Counter()
    detail = []
    totA = sum(num(r[f'{A} Clicks']) for r in rows)
    totB = sum(num(r[f'{B} Clicks']) for r in rows)
    iA = sum(num(r[f'{A} Impressions']) for r in rows)
    iB = sum(num(r[f'{B} Impressions']) for r in rows)
    within = 0.0
    for r in rows:
        cA, cB = num(r[f'{A} Clicks']), num(r[f'{B} Clicks'])
        mA, mB = num(r[f'{A} Impressions']), num(r[f'{B} Impressions'])
        pA, pB = num(r[f'{A} Position']), num(r[f'{B} Position'])
        if mA == 0 and mB == 0:
            continue
        if mB == 0:
            out['lost queries/pages'] += -cA
            detail.append((r[key], 'LOST', cA, cB, mA, mB, pA, pB))
            continue
        if mA == 0:
            out['new queries/pages'] += cB
            continue
        ctrA, ctrB = cA / mA, cB / mB
        imp_eff = (mB - mA) * ctrA
        ranked_worse = pB - pA > POS_TOL
        out['ranking' if ranked_worse else 'demand'] += imp_eff
        exp_ctr_B = at(pB) if at(pA) else ctrA
        pos_part = mB * (exp_ctr_B - at(pA)) if at(pA) else 0.0
        ctr_eff = mB * (ctrB - ctrA)
        out['ranking'] += pos_part
        out['CTR/SERP'] += ctr_eff - pos_part
        within += imp_eff + ctr_eff
        cls = 'RANKING' if ranked_worse else ('DEMAND' if abs(imp_eff) >= abs(ctr_eff) else 'CTR')
        detail.append((r[key], cls, cA, cB, mA, mB, pA, pB))
    total = totB - totA
    out['query mix / unexplained'] = total - sum(out.values())
    return out, detail, (totA, totB, iA, iB)


def live_status(url):
    try:
        req = urllib.request.Request(url, method='GET', headers={'User-Agent': 'prnm-gsc-compare'})

        class NoRedir(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        op = urllib.request.build_opener(NoRedir)
        with op.open(req, timeout=20) as r:
            body = r.read(200000).decode('utf8', 'replace')
            noindex = bool(re.search(r'name="robots"[^>]*noindex', body)) or 'noindex' in (r.headers.get('X-Robots-Tag') or '')
            return r.status, noindex
    except urllib.error.HTTPError as e:
        return e.code, False
    except Exception:
        return 0, False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    z = zipfile.ZipFile(sys.argv[1])
    live = '--no-live' not in sys.argv
    for name, key in (('Queries.csv', 'Top queries'), ('Pages.csv', 'Top pages')):
        rows, per = read(z, name)
        if not rows:
            print(f'{name}: not in export')
            continue
        A, B = periods(per)
        out, detail, (cA, cB, iA, iB) = decompose(rows, key, A, B)
        print(f'\n== {name}: {A} -> {B}')
        print(f'   clicks {cA:.0f} -> {cB:.0f} ({cB - cA:+.0f});  impressions {iA:.0f} -> {iB:.0f}')
        if name == 'Pages.csv' and live:
            gone = 0.0
            for d in detail:
                if d[3] < d[2]:
                    st, nx = live_status(d[0])
                    if st != 200 or nx:
                        gone += d[3] - d[2]
            out['indexation/URL change (pages now non-200 or noindex)'] = gone
            print('   (indexation bucket overlaps the others: it re-labels part of them)')
        for k, v in sorted(out.items(), key=lambda kv: kv[1]):
            share = (100 * v / (cB - cA)) if cB != cA else 0
            print(f'   {k:55} {v:+9.0f}  ({share:5.1f}% of change)')
        worst = sorted(detail, key=lambda d: d[3] - d[2])[:25]
        print(f'   top losers ({key}): class, clicks A->B, impr A->B, pos A->B')
        for d in worst:
            print(f'   {d[1]:8} {d[2]:5.0f}->{d[3]:<5.0f} {d[4]:7.0f}->{d[5]:<7.0f} {d[6]:5.1f}->{d[7]:<5.1f} {d[0][:90]}')


if __name__ == '__main__':
    main()
