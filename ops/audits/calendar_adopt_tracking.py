#!/usr/bin/env python3
"""
Adopt provably-PRNM calendar exceptions into server-side tracking.
DRY RUN unless APPLY = True below (set only with Derek's GO).

Input: the newest /home/ubuntu/audits/calendar_orphans_*.json from
calendar_orphan_audit.py. Adopts ONLY rows classed `untracked_desired`:
seats:0, created by the PRNM Integration API client (event log), and exactly
the range the listing's current calendar asks for on that date.

Effect of APPLY: one Integration API listings/update per listing, writing
privateData.prnmCalendarExceptionIds (merged with any ids already tracked).
Nothing is created or deleted, publicData is not touched, no block changes.
Each id is re-checked live (still exists, same start/end) before adoption.
"""
import glob, json, subprocess, urllib.request, urllib.parse, time

APPLY = False
KEY = 'prnmCalendarExceptionIds'
env = dict(l.split('=', 1) for l in subprocess.run(
    ['docker', 'inspect', 'poolrentalnearme-production', '--format', '{{range .Config.Env}}{{println .}}{{end}}'],
    capture_output=True, text=True).stdout.splitlines() if '=' in l)
TOK = json.load(urllib.request.urlopen(urllib.request.Request(
    'https://flex-integ-api.sharetribe.com/v1/auth/token',
    data=urllib.parse.urlencode({'client_id': env['SHARETRIBE_INTEGRATION_SDK_CLIENT_ID'],
                                 'client_secret': env['SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET'],
                                 'grant_type': 'client_credentials', 'scope': 'integ'}).encode()), timeout=30))['access_token']
BASE = 'https://flex-integ-api.sharetribe.com/v1/integration_api/'


def ig(path, body=None, **p):
    req = urllib.request.Request(BASE + path + ('?' + urllib.parse.urlencode(p) if p else ''),
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=40))


rep = json.load(open(sorted(glob.glob('/home/ubuntu/audits/calendar_orphans_*.json'))[-1]))
print('audit', rep['generatedAt'], 'APPLY' if APPLY else 'DRY RUN')
total = 0
for L in rep['listings']:
    rows = [x for x in L['exceptions'] if x['class'] == 'untracked_desired']
    if not rows:
        continue
    lid = L['listing']
    starts = sorted(x['start'] for x in rows)
    ends = sorted(x['end'] for x in rows)
    ex, page = [], 1
    while True:
        r = ig('availability_exceptions/query', listingId=lid, start=starts[0], end=ends[-1], perPage=100, page=page)
        ex += r['data']
        if page >= (r.get('meta') or {}).get('totalPages', 1) or not r['data']:
            break
        page += 1
    live = {e['id']: e['attributes'] for e in ex}
    ok = [x for x in rows if x['id'] in live and live[x['id']]['seats'] == 0
          and live[x['id']]['start'][:19] == x['start'][:19] and live[x['id']]['end'][:19] == x['end'][:19]]
    pv = ig('listings/show', id=lid)['data']['attributes'].get('privateData') or {}
    track = {d: list(ids) for d, ids in (pv.get(KEY) or {}).items()}
    for x in ok:
        if x['id'] not in track.get(x['date'], []):
            track.setdefault(x['date'], []).append(x['id'])
    total += len(ok)
    print(lid, L['title'], f"adopt {len(ok)}/{len(rows)}", 'feed' if L['externalFeed'] else '')
    if APPLY and ok:
        ig('listings/update', body={'id': lid, 'privateData': {KEY: track}})
        time.sleep(0.3)
print('total adoptable', total, '(applied)' if APPLY else '(dry run: nothing written)')
