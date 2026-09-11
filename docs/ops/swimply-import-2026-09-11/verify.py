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
u=B+"/v1/integration_api/listings/show?"+urllib.parse.urlencode({"id":"6aa48caa-bfda-4e32-87ee-4cff77f4c0d6","include":"images,author"})
r=json.loads(urllib.request.urlopen(urllib.request.Request(u,headers={"Authorization":"Bearer "+tok}),timeout=60).read())
d=r["data"]; a=d["attributes"]
print("state:", a["state"], "| title:", a["title"])
print("price:", a["price"], "| geo:", a["geolocation"])
print("plan:", a["availabilityPlan"]["timezone"], len(a["availabilityPlan"]["entries"]), "entries", a["availabilityPlan"]["entries"][0])
pd=a["publicData"]
for k in ["listingType","unitType","transactionProcessAlias","categoryLevel1","categoryLevel2","location","guestallowed","priceVariationsEnabled","priceVariants","importedFrom","houseRules","space","alcohol","smoking","loud_music","shower","cancellation_policy","advanceNoticeDays","isInstantBooking","minBookingHours"]:
    print("  %-24s %s" % (k, json.dumps(pd.get(k))[:200]))
print("  amenities:", len(pd.get("amenities") or []), "| externalReviews count:", (pd.get("externalReviews") or {}).get("count"))
imgs=[x for x in (r.get("included") or []) if x["type"]=="image"]
print("IMAGES attached:", len(imgs))
au=[x for x in (r.get("included") or []) if x["type"]=="user"]
if au: print("author:", au[0]["attributes"]["profile"]["displayName"], "| stripeConnected:", au[0]["attributes"].get("stripeConnected"))
