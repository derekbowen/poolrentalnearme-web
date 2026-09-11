import json, os, subprocess, urllib.request, urllib.parse
D="/home/ubuntu/sw84203"
p=json.load(open(D+"/payload.json"))
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
os.makedirs(D+"/img", exist_ok=True)
ids=[]
for i,u in enumerate(p["images"]):
    f=f"{D}/img/{i:02d}.jpg"
    if not os.path.exists(f) or os.path.getsize(f)<5000:
        subprocess.run(["curl","-sSL","-H","Accept: image/jpeg","-o",f, u+"?fm=jpg&w=2400&q=80"],timeout=120)
    sz=os.path.getsize(f)
    r=subprocess.run(["curl","-sS","-X","POST",B+"/v1/integration_api/images/upload",
        "-H","Authorization: Bearer "+tok,"-F","image=@%s;type=image/jpeg"%f],
        capture_output=True,text=True,timeout=180)
    try:
        j=json.loads(r.stdout); uid=j["data"]["id"]
        if isinstance(uid,dict): uid=uid["uuid"]
    except Exception:
        print(i,"UPLOAD FAIL",sz,r.stdout[:300]); continue
    ids.append(uid); print(i,"ok",sz,uid)
json.dump(ids, open(D+"/image_ids.json","w"))
print("UPLOADED", len(ids), "of", len(p["images"]))
