import json, os, urllib.request, urllib.parse
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
LID="6a8905c7-2607-48ae-8935-3ea6a62b53c3"
def get():
    u=B+"/v1/integration_api/listings/show?"+urllib.parse.urlencode({"id":LID})
    return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers={"Authorization":"Bearer "+tok}),timeout=60).read())["data"]
def snap(d):
    a=d["attributes"]; pd=a["publicData"]
    return {"price":a["price"],"priceVariationsEnabled":pd.get("priceVariationsEnabled"),
            "priceVariants":pd.get("priceVariants"),"state":a["state"],"title":a["title"]}
before=snap(get())
print("BEFORE:"); print(json.dumps(before, indent=1))
payload={"id":LID,"publicData":{"priceVariationsEnabled":True}}
r=urllib.request.Request(B+"/v1/integration_api/listings/update?expand=true",
    json.dumps(payload).encode(), {"Content-Type":"application/json","Authorization":"Bearer "+tok})
try:
    res=json.loads(urllib.request.urlopen(r,timeout=90).read()); print("\nHTTP 200 update ok")
except urllib.error.HTTPError as e:
    print("\nUPDATE FAILED", e.code, e.read().decode()[:600]); raise SystemExit(1)
after=snap(get())
print("\nAFTER:"); print(json.dumps(after, indent=1))
print("\n--- diff ---")
for k in sorted(set(before)|set(after)):
    if json.dumps(before.get(k),sort_keys=True)!=json.dumps(after.get(k),sort_keys=True):
        print("  %s: %r -> %r" % (k, before.get(k), after.get(k)))
    else:
        print("  %s: UNCHANGED" % k)
json.dump({"before":before,"after":after}, open("/home/ubuntu/jfp_fix.json","w"), indent=1)
