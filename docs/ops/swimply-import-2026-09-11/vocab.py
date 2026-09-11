import json, urllib.request, urllib.parse, os, collections
env={}
for p in ["/home/ubuntu/live.env","/home/ubuntu/build/.env"]:
    if os.path.exists(p):
        for line in open(p):
            line=line.strip()
            if line and not line.startswith("#") and "=" in line:
                k,v=line.split("=",1); env.setdefault(k,v.strip().strip('"').strip("'"))
cid=env["SHARETRIBE_INTEGRATION_SDK_CLIENT_ID"]; sec=env["SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET"]
B="https://flex-integ-api.sharetribe.com"
body=urllib.parse.urlencode({"grant_type":"client_credentials","client_id":cid,"client_secret":sec,"scope":"integ"}).encode()
tok=json.loads(urllib.request.urlopen(urllib.request.Request(B+"/v1/auth/token",body,{"Content-Type":"application/x-www-form-urlencoded"}),timeout=40).read())["access_token"]
def get(path,params):
    u=B+path+"?"+urllib.parse.urlencode(params)
    r=urllib.request.Request(u,headers={"Authorization":"Bearer "+tok})
    return json.loads(urllib.request.urlopen(r,timeout=90).read())
vals=collections.defaultdict(collections.Counter)
n=0; page=1
while page<=6:
    r=get("/v1/integration_api/listings/query",{"states":"published","perPage":100,"page":page})
    d=r.get("data") or []
    if not d: break
    for it in d:
        n+=1
        pd=it["attributes"].get("publicData") or {}
        for k,v in pd.items():
            if isinstance(v,(str,int,bool)): vals[k][str(v)[:40]]+=1
            elif isinstance(v,list):
                for x in v:
                    if isinstance(x,(str,int,bool)): vals[k][str(x)[:40]]+=1
    meta=(r.get("meta") or {})
    if page>=meta.get("totalPages",1): break
    page+=1
print("listings scanned:", n)
for k in sorted(vals):
    c=vals[k]
    if len(c)<=30:
        print("%-26s %s" % (k, ", ".join("%s(%d)"%(a,b) for a,b in c.most_common(30))))
    else:
        print("%-26s <%d distinct> %s" % (k, len(c), ", ".join(a for a,_ in c.most_common(6))))
