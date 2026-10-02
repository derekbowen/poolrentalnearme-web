# READ-ONLY audience build. GET requests only; prints counts, never addresses.
import subprocess,json,urllib.request,urllib.parse,collections,os,re,time
env=dict(l.split('=',1) for l in subprocess.run(['docker','inspect','poolrentalnearme-production','--format','{{range .Config.Env}}{{println .}}{{end}}'],capture_output=True,text=True).stdout.splitlines() if '=' in l)
T=json.load(urllib.request.urlopen(urllib.request.Request('https://flex-integ-api.sharetribe.com/v1/auth/token',data=urllib.parse.urlencode({'client_id':env['SHARETRIBE_INTEGRATION_SDK_CLIENT_ID'],'client_secret':env['SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET'],'grant_type':'client_credentials','scope':'integ'}).encode()),timeout=30))['access_token']
def ig(p,**q):
    for k in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request('https://flex-integ-api.sharetribe.com/v1/integration_api/'+p+'?'+urllib.parse.urlencode(q),headers={'Authorization':'Bearer '+T}),timeout=40))
        except urllib.error.HTTPError as e:
            if e.code==429: time.sleep(3*(k+1)); continue
            raise
def allpages(p,**q):
    out=[];page=1
    while True:
        r=ig(p,perPage=100,page=page,**q); out+=r['data']
        if page>=(r.get('meta') or {}).get('totalPages',1): return out
        page+=1
users=allpages('users/query'); listings=allpages('listings/query',include='author')
author=collections.Counter(); states=collections.defaultdict(set); titles=collections.defaultdict(list)
for L in listings:
    a=L['relationships']['author']['data']['id'] if L.get('relationships') else None
    if a: author[a]+=1; states[a].add(L['attributes'].get('state')); titles[a].append(L['attributes'].get('title') or '')
SU=env['SUPABASE_URL'].rstrip('/'); SK=env['SUPABASE_SERVICE_ROLE_KEY']
def sb(table,select,flt=''):
    try:
        req=urllib.request.Request(f"{SU}/rest/v1/{table}?select={select}{flt}",headers={'apikey':SK,'Authorization':'Bearer '+SK,'Range':'0-9999'})
        return json.load(urllib.request.urlopen(req,timeout=30))
    except Exception as e: return ('ERR',str(e)[:80])
sup={}
for t,sel,flt in [('suppressed_emails','email,reason',''),('host_subscribers','*',''),('composer_unsubscribes','email','')]:
    sup[t]=sb(t,sel,flt)
supp=set()
for t,rows in sup.items():
    if isinstance(rows,tuple): print('suppression table',t,'->',rows); continue
    for r in rows:
        e=(r.get('email') or '').strip().lower()
        if not e: continue
        if t=='host_subscribers':
            flags={k:v for k,v in r.items() if k in ('unsubscribed','status','unsubscribed_at','excluded','paused','state')}
            if not (r.get('unsubscribed') is True or r.get('unsubscribed_at') or r.get('excluded') is True or r.get('paused') is True or str(r.get('status') or r.get('state') or '').lower() in ('unsubscribed','excluded','paused')): continue
        supp.add(e)
    print('suppression table',t,'rows',len(rows), 'columns', sorted(rows[0].keys()) if rows and t=='host_subscribers' else '')
reasons=collections.Counter(); segs=collections.defaultdict(list); dnc=[]
for U in users:
    a=U['attributes']; uid=U['id']; e=(a.get('email') or '').strip().lower(); pr=a.get('profile') or {}
    name=((pr.get('firstName') or '')+' '+(pr.get('lastName') or '')).strip()
    utype=((pr.get('publicData') or {}).get('userType') or '')
    if a.get('deleted'): reasons['deleted']+=1; continue
    if a.get('banned'): reasons['banned']+=1; continue
    if not e or '@' not in e: reasons['no email']+=1; continue
    if re.search(r'james\s+martin',name,re.I) or any('cypress river' in t.lower() for t in titles.get(uid,[])):
        dnc.append(uid); reasons['DO-NOT-CONTACT (James Martin / Cypress River Oasis)']+=1; continue
    if e in supp: reasons['suppressed (bounce/complaint/unsubscribe)']+=1; continue
    seg = '1 host: has a published listing' if 'published' in states.get(uid,set()) else ('2 host: listing not published' if author.get(uid) else ('3 host signup: provider, no listing' if utype=='provider' else '4 customer'))
    segs[seg].append((uid,e,bool(a.get('emailVerified')),a.get('createdAt')))
print('sharetribe users',len(users),'listings',len(listings))
print('excluded:',dict(reasons))
tot=0
for s in sorted(segs):
    v=sum(1 for x in segs[s] if x[2]); tot+=len(segs[s])
    print(f'  {s}: {len(segs[s])} (email verified {v}, unverified {len(segs[s])-v})')
print('total sendable before your decisions:',tot)
dom=collections.Counter(x[1].split('@')[1] for s in segs for x in segs[s])
print('test-looking addresses:',sum(1 for s in segs for x in segs[s] if re.search(r'test|example\.|mailinator|\+\d|yopmail|poolrentalnearme',x[1])))
os.makedirs('/home/ubuntu/broadcast',exist_ok=True)
json.dump({s:segs[s] for s in segs},open('/home/ubuntu/broadcast/ceo_update_audience.json','w'))
os.chmod('/home/ubuntu/broadcast/ceo_update_audience.json',0o600)
print('do-not-contact user ids:',[d[:8] for d in dnc])
for d in dnc: print('  dnc', d[:8], 'listings:', titles.get(d, []), 'userType:', next(((u['attributes'].get('profile') or {}).get('publicData') or {}).get('userType') for u in users if u['id']==d))
print('suppressed addresses after host_subscribers:', len(supp))
