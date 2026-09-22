"""DRY RUN ONLY -- writes nothing. Shows exactly what redacting the 10 leaked
public addresses would change, and confirms the full address survives in
privateData.exactAddress (or can be moved there first)."""
import os, json, re, urllib.request, urllib.parse
def env(p):
    d={}
    for line in open(p):
        line=line.strip()
        if line and not line.startswith("#") and "=" in line: k,v=line.split("=",1); d[k]=v.strip().strip('"').strip("'")
    return d
e=env("/home/ubuntu/build/.env")
data=urllib.parse.urlencode({"client_id":e["SHARETRIBE_INTEGRATION_SDK_CLIENT_ID"],
  "client_secret":e["SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET"],
  "grant_type":"client_credentials","scope":"integ"}).encode()
tok=json.load(urllib.request.urlopen(urllib.request.Request(
  "https://flex-integ-api.sharetribe.com/v1/auth/token",data=data,
  headers={"Content-Type":"application/x-www-form-urlencoded"})))["access_token"]
rows,page=[],1
while True:
    u=("https://flex-integ-api.sharetribe.com/v1/integration_api/listings/query"
       f"?states=published&perPage=100&page={page}")
    r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"Authorization":"Bearer "+tok})))
    rows+=r["data"]; m=r.get("meta",{})
    if page>=m.get("totalPages",1): break
    page+=1

STREETY=re.compile(r"^\s*\d+[\s,]|\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|way|ct|court|blvd|cres|crescent|pl|place|ter|terrace|cir|circle|hwy|pkwy|trail|trl|close)\b\.?$", re.I)
def safe_from_parts(addr):
    """Same shape the fixed Merlin now publishes: City, ST ZIP -- derived from
    the tail of the formatted address, never the street line. Only used here to
    PROPOSE a value; nothing is written."""
    parts=[p.strip() for p in addr.split(",") if p.strip()]
    if len(parts)<2: return None
    # drop a trailing country token, then drop the leading street line
    if parts[-1].upper() in ("USA","US","UNITED STATES","AUSTRALIA","CANADA","UK","UNITED KINGDOM"):
        parts=parts[:-1]
    if len(parts)>=2 and STREETY.search(parts[0].split()[-1] if parts[0].split() else "") or re.match(r"^\d+\s", parts[0]):
        parts=parts[1:]
    return ", ".join(parts) if parts else None

n=0
print(f"{'title':40} {'CURRENT PUBLIC (leaking)':46} -> PROPOSED PUBLIC        | private kept")
print("-"*145)
for d in rows:
    a=d["attributes"]; pub=a.get("publicData") or {}
    loc=pub.get("location") or {}
    addr=(loc.get("address") or "").strip()
    if not addr: continue
    first=addr.split(",")[0].strip()
    toks=first.split()
    streety = bool(re.match(r"^\s*\d+[\s,]", first)) or (len(toks)>1 and STREETY.search(toks[-1]))
    if not streety: continue
    n+=1
    priv=(a.get("privateData") or {}).get("exactAddress")
    proposed=safe_from_parts(addr)
    print(f"{(a.get('title') or '')[:38]:40} {addr[:44]:46} -> {str(proposed)[:22]:22} | {'yes' if priv else 'NO -- move addr here first'}")
print("-"*145)
print(f"listings that would change: {n}")
print("NOTHING WAS WRITTEN. This is a dry run.")
