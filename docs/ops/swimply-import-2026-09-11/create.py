import json, os, urllib.request, urllib.parse
D="/home/ubuntu/sw84203"
p=json.load(open(D+"/payload.json")); L=dict(p["listing"])
ids=json.load(open(D+"/image_ids.json"))
env={}
for f in ["/home/ubuntu/live.env","/home/ubuntu/build/.env"]:
    if os.path.exists(f):
        for line in open(f):
            line=line.strip()
            if line and not line.startswith("#") and "=" in line:
                k,v=line.split("=",1); env.setdefault(k,v.strip().strip('"').strip("'"))
cid=env["SHARETRIBE_INTEGRATION_SDK_CLIENT_ID"]; sec=env["SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET"]
B="https://flex-integ-api.sharetribe.com"
body=urllib.parse.urlencode({"grant_type":"client_credentials","client_id":cid,"client_secret":sec,"scope":"integ"}).encode()
tok=json.loads(urllib.request.urlopen(urllib.request.Request(B+"/v1/auth/token",body,{"Content-Type":"application/x-www-form-urlencoded"}),timeout=40).read())["access_token"]

# guard: refuse if this host already has a listing or this swimply id was already imported
def get(path,params):
    u=B+path+"?"+urllib.parse.urlencode(params)
    return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers={"Authorization":"Bearer "+tok}),timeout=60).read())
ex=get("/v1/integration_api/listings/query",{"authorId":L["authorId"],"perPage":10}).get("data") or []
if ex:
    print("ABORT: author already has %d listing(s):"%len(ex), [(x["id"],x["attributes"]["title"]) for x in ex]); raise SystemExit

L["images"]=ids
def post(url,data):
    r=urllib.request.Request(url, json.dumps(data).encode(),
        {"Content-Type":"application/json","Authorization":"Bearer "+tok})
    try: return 200, json.loads(urllib.request.urlopen(r,timeout=90).read())
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:900]

code, res = post(B+"/v1/integration_api/listings/create?expand=true", L)
if code!=200 and "state" in str(res):
    L.pop("state",None)
    code,res = post(B+"/v1/integration_api/listings/create?expand=true", L)
print("HTTP", code)
if code==200:
    d=res["data"]
    print("LISTING ID:", d["id"] if isinstance(d["id"],str) else d["id"]["uuid"])
    print("state:", d["attributes"]["state"], "| title:", d["attributes"]["title"])
    print("price:", d["attributes"]["price"], "| images:", len((res.get("data",{}).get("relationships",{}).get("images",{}) or {}).get("data",[]) or []))
else:
    print(res)
