#!/usr/bin/env python3
"""
READ-ONLY audit of PRNM custom-calendar availability exceptions (seats:0).
Runs on WEST (reads Sharetribe Integration creds from the MAIN container env;
never prints them). Issues GET requests only: nothing is created, updated or
deleted. Writes the full report to /home/ubuntu/audits/calendar_orphans_<ts>.json
and prints counts.

Per blocked exception in [now-1d, now+364d] on every listing that uses the
custom calendar (has dateOverrides or tracking ids):
  tracked_desired     tracked by PRNM and still wanted                -> fine
  tracked_obsolete    tracked by PRNM, no longer wanted               -> SAFE TO REPAIR (delete)
  untracked_desired   untracked but exactly what the schedule wants   -> keep; safe to ADOPT (track), never delete
  suspected_orphan    untracked, not wanted, created by the PRNM server
                      (Integration API client, events log), shape PRNM
                      derives for a date with an override, listing has
                      no external calendar feed                       -> SAFE TO REPAIR (delete)
  ambiguous           untracked, not wanted, provenance or shape not
                      provable (older than the 90-day event log, iCal/
                      Swimply feed on the listing, odd shape)         -> MANUAL REVIEW
  manual              created by the web/app client (host's own)      -> never touch
"""
import subprocess, json, urllib.request, urllib.parse, time, os, datetime as dt
from zoneinfo import ZoneInfo

env = dict(l.split('=', 1) for l in subprocess.run(
    ['docker', 'inspect', 'poolrentalnearme-production', '--format', '{{range .Config.Env}}{{println .}}{{end}}'],
    capture_output=True, text=True).stdout.splitlines() if '=' in l)
ICID = env['SHARETRIBE_INTEGRATION_SDK_CLIENT_ID']
WEB = env.get('REACT_APP_SHARETRIBE_SDK_CLIENT_ID') or env.get('VITE_SHARETRIBE_SDK_CLIENT_ID') or ''
TOK = json.load(urllib.request.urlopen(urllib.request.Request(
    'https://flex-integ-api.sharetribe.com/v1/auth/token',
    data=urllib.parse.urlencode({'client_id': ICID, 'client_secret': env['SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET'],
                                 'grant_type': 'client_credentials', 'scope': 'integ'}).encode()), timeout=30))['access_token']


def ig(path, **p):
    for attempt in range(4):
        try:
            req = urllib.request.Request('https://flex-integ-api.sharetribe.com/v1/integration_api/' + path + '?' +
                                         urllib.parse.urlencode(p), headers={'Authorization': 'Bearer ' + TOK})
            return json.load(urllib.request.urlopen(req, timeout=40))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            raise


def ts(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))


NOW = dt.datetime.now(dt.timezone.utc)
W0, W1 = NOW - dt.timedelta(days=1), NOW + dt.timedelta(days=364)
iso = lambda d: d.strftime('%Y-%m-%dT%H:%M:%S.000Z')

# Provenance: every availabilityException/created in the event log (90 days).
prov, after = {}, None
while True:
    # createdAtStart and startAfterSequenceId are mutually exclusive.
    p = {'eventTypes': 'availabilityException/created'}
    if after is None:
        p['createdAtStart'] = iso(NOW - dt.timedelta(days=88))
    else:
        p['startAfterSequenceId'] = after
    d = ig('events/query', **p)['data']
    if not d:
        break
    for e in d:
        a = e['attributes']
        cid = (a.get('auditData') or {}).get('clientId') or ''
        prov[a['resourceId']] = 'integ' if cid == ICID else ('web' if cid == WEB else (a.get('source') or 'other'))
        after = a['sequenceId']
    if len(d) < 100:
        break


def ranges_for(date, o, tz):
    y, m, d = map(int, date.split('-'))
    z = ZoneInfo(tz)
    ds = dt.datetime(y, m, d, tzinfo=z)
    de = dt.datetime.combine(ds.date() + dt.timedelta(days=1), dt.time(), tzinfo=z)
    at = lambda h: de if h >= 24 else dt.datetime(y, m, d, h, tzinfo=z)
    out = []
    if not isinstance(o, dict):
        return out
    if o.get('closed'):
        out = [(ds, de)]
        return [(s.astimezone(dt.timezone.utc), e.astimezone(dt.timezone.utc)) for s, e in out]
    op, cl = o.get('open'), o.get('close')
    if isinstance(op, int) and isinstance(cl, int) and cl > op and (op > 0 or cl < 24):
        if op > 0:
            out.append((ds, at(op)))
        if cl < 24:
            out.append((at(cl), de))
    for b in o.get('blocks') or []:
        if isinstance(b, list) and len(b) == 2 and all(isinstance(x, int) for x in b) and 0 <= b[0] < b[1] <= 24:
            out.append((at(b[0]), at(b[1])))
    return [(s.astimezone(dt.timezone.utc), e.astimezone(dt.timezone.utc)) for s, e in out]


def prnm_shape(s, e, tz, dates):
    """True if [s,e) is hour-aligned inside one local day that has an override."""
    z = ZoneInfo(tz)
    ls, le = s.astimezone(z), e.astimezone(z)
    day = ls.date().isoformat()
    if day not in dates or ls.minute or ls.second:
        return False
    nxt = dt.datetime.combine(ls.date() + dt.timedelta(days=1), dt.time(), tzinfo=z)
    return (le.minute == 0 and le.second == 0 and le.date() == ls.date()) or le == nxt


counts = {k: 0 for k in ['tracked_desired', 'tracked_obsolete', 'untracked_desired', 'untracked_desired_unproven', 'suspected_orphan',
                         'ambiguous', 'manual', 'uncovered_desired', 'past_ignored']}
report, scanned, calendar_listings, page = [], 0, 0, 1
while True:
    r = ig('listings/query', perPage=100, page=page)
    for L in r['data']:
        scanned += 1
        at = L['attributes']
        pd, pv = at.get('publicData') or {}, at.get('privateData') or {}
        av = pd.get('availability') or {}
        ov = av.get('dateOverrides') or {}
        tr = set()
        for m in (av.get('calendarExceptionIds') or {}, pv.get('prnmCalendarExceptionIds') or {}):
            for ids in m.values():
                tr.update(ids or [])
        if not ov and not tr:
            continue
        calendar_listings += 1
        tz = ((at.get('availabilityPlan') or {}).get('timezone')) or 'Etc/UTC'
        feed = bool(pd.get('externalCalendarUrls') or pd.get('icalUrl') or pd.get('swimplyIcalUrl') or
                    pv.get('icalUrl') or pv.get('swimplyIcalUrl'))
        desired = []
        for date in sorted(ov):
            try:
                desired += [(date, s, e) for s, e in ranges_for(date, ov[date], tz) if e > NOW]
            except Exception:
                pass
        ex, ep = [], 1
        while True:
            er = ig('availability_exceptions/query', listingId=L['id'], start=iso(W0), end=iso(W1), perPage=100, page=ep)
            ex += er['data']
            time.sleep(0.15)
            if ep >= ((er.get('meta') or {}).get('totalPages') or 1) or not er['data']:
                break
            ep += 1
        rows = []
        matched = set()
        for x in ex:
            a = x['attributes']
            if a.get('seats') != 0:
                continue
            s, e = ts(a['start']), ts(a['end'])
            if e <= NOW:
                counts['past_ignored'] += 1  # already over; blocks nothing
                continue
            want = next((d for d in desired if d[2] == e and (d[1] == s or (d[1] < NOW and d[1] <= s <= NOW + dt.timedelta(minutes=5)))), None)
            src = prov.get(x['id'], 'unknown(>90d)')
            if x['id'] in tr:
                cls = 'tracked_desired' if want else 'tracked_obsolete'
            elif want:
                # integ-created + exact PRNM range for this date = provably ours
                cls = 'untracked_desired' if src == 'integ' else 'untracked_desired_unproven'
            elif src == 'web':
                cls = 'manual'
            elif src == 'integ' and not feed and prnm_shape(s, e, tz, ov):
                cls = 'suspected_orphan'
            else:
                cls = 'ambiguous'
            if want:
                matched.add((want[1], want[2]))
            counts[cls] += 1
            rows.append({'id': x['id'], 'start': a['start'], 'end': a['end'], 'class': cls, 'createdBy': src,
                         'date': want[0] if want else None})
        unc = [(d, s, e) for d, s, e in desired if (s, e) not in matched]
        counts['uncovered_desired'] += len(unc)
        if any(r['class'] not in ('tracked_desired',) for r in rows) or unc:
            report.append({'listing': L['id'], 'title': (at.get('title') or '')[:40], 'state': at.get('state'), 'tz': tz,
                           'externalFeed': feed, 'exceptions': rows,
                           'uncoveredDesired': [{'date': d, 'start': iso(s), 'end': iso(e)} for d, s, e in unc]})
    tp = (r.get('meta') or {}).get('totalPages') or 1
    total_items = (r.get('meta') or {}).get('totalItems')
    if page >= tp:
        break
    page += 1

os.makedirs('/home/ubuntu/audits', exist_ok=True)
out = f"/home/ubuntu/audits/calendar_orphans_{NOW.strftime('%Y%m%dT%H%M%SZ')}.json"
json.dump({'generatedAt': iso(NOW), 'listingsTotal': total_items, 'listingsScanned': scanned, 'calendarListings': calendar_listings,
           'eventsIndexed': len(prov), 'counts': counts, 'listings': report}, open(out, 'w'), indent=1)
print('REPORT', out)
print(json.dumps({'listingsTotal': total_items, 'listingsScanned': scanned, 'calendarListings': calendar_listings, 'eventsIndexed': len(prov),
                  'counts': counts}))
QUIET = ('tracked_desired', 'untracked_desired')
for L in report:
    n = {}
    for x in L['exceptions']:
        n[x['class']] = n.get(x['class'], 0) + 1
    print('\n', L['listing'], L['state'], L['tz'], 'feed' if L['externalFeed'] else '', L['title'], json.dumps(n))
    for x in L['exceptions']:
        if x['class'] not in QUIET:
            print('   ', x['class'].ljust(18), x['createdBy'].ljust(14), x['start'][:16], '->', x['end'][:16], x['id'][:8])
    for u in L['uncoveredDesired']:
        print('    UNCOVERED desired', u['date'], u['start'][:16], '->', u['end'][:16])
