"""Merlin: never display or publish a street address as the public location.

Root cause: every public-location surface read `location.address`, the raw
formatted address from Google Places. The publish payload tried to redact it
with /^\d+\s/ on that string -- which only fires when the address begins with a
house number, so "Nicholas Dr, Carlisle, PA" published verbatim.

Fix: one formatter, __prnmPublicLoc, built ONLY from structured components
(city/state/country/zip). It never reads .address, so no parsing rule can leak.
"""
import subprocess, shutil, os, datetime
def sh(c,t=300):
    r=subprocess.run(c,shell=True,capture_output=True,text=True,errors="replace",timeout=t)
    return (r.stdout+r.stderr).strip()
F="/home/ubuntu/merlin/dist/assets/index-4d5740d4.js"
STAMP=datetime.datetime.utcnow().strftime("%Y%m%d-%H%M%S")
BAK=f"{F}.bak-publicloc-{STAMP}"
s=open(F,encoding="utf-8").read()
orig=s
shutil.copy2(F,BAK)
print("backup:",BAK)

HELPER = (
 'function __prnmPublicLoc(l,z){'
 'l=l||{};'
 'var g=function(k){var v=l[k];return v==null?"":String(v).trim()};'
 'var c=g("city"),t=g("state"),p=g("zip"),n=g("country");'
 'if(c&&t)return z&&p?c+", "+t+" "+p:c+", "+t;'
 'if(c)return c;'
 'if(t&&n)return t+", "+n;'
 'if(t)return t;'
 'if(n)return n;'
 'return""}\n'
)

EDITS=[
 # 0. persist a country component alongside city/state/zip
 ('init',
  'location:{address:"",building:"",city:"",state:"",zip:"",lat:null,lng:null}',
  'location:{address:"",building:"",city:"",state:"",zip:"",country:"",lat:null,lng:null}'),
 # 1. Places: locality is absent in many countries. Fall back through the
 #    other ADMINISTRATIVE component types -- never to a street component --
 #    and keep the country for a last-resort broad fallback.
 ('extract',
  'let T="",G="",W="";for(const H of R.address_components??[])H.types.includes("locality")&&(T=H.long_name),H.types.includes("administrative_area_level_1")&&(G=H.short_name),H.types.includes("postal_code")&&(W=H.short_name);r({address:R.formatted_address??"",city:T,state:G,zip:W,lat:R.geometry.location.lat(),lng:R.geometry.location.lng()})',
  'let T="",G="",W="",Ta="",Tb="",Tc="",Tn="";for(const H of R.address_components??[])H.types.includes("locality")&&(T=H.long_name),H.types.includes("postal_town")&&(Ta=H.long_name),(H.types.includes("sublocality_level_1")||H.types.includes("sublocality"))&&(Tb=H.long_name),H.types.includes("administrative_area_level_2")&&(Tc=H.long_name),H.types.includes("country")&&(Tn=H.long_name),H.types.includes("administrative_area_level_1")&&(G=H.short_name),H.types.includes("postal_code")&&(W=H.short_name);r({address:R.formatted_address??"",city:T||Ta||Tb||Tc,state:G,zip:W,country:Tn,lat:R.geometry.location.lat(),lng:R.geometry.location.lng()})'),
 # 2. forward country into the draft
 ('onChange',
  'onChange:B=>u({address:B.address,city:B.city,state:B.state,zip:B.zip,lat:B.lat,lng:B.lng})',
  'onChange:B=>u({address:B.address,city:B.city,state:B.state,zip:B.zip,country:B.country,lat:B.lat,lng:B.lng})'),
 # 3. PUBLISH: the real leak. Structured only; the raw address stays private.
 ('publish',
  'location:{address:(c.location&&/^\\d+\\s/.test(String(c.location.address||""))?[c.location.city,[c.location.state,c.location.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "):String(c.location&&c.location.address||"")),building:null,city:null}',
  'location:{address:__prnmPublicLoc(c.location,!0),building:null,city:null}'),
 # 4. small preview card
 ('card_sm',
  'c.location.address&&s.jsxs("div",{className:"flex items-center gap-1 text-sm text-slate-500",children:[s.jsx(ua,{className:"w-3 h-3"}),c.location.address]})',
  '__prnmPublicLoc(c.location)&&s.jsxs("div",{className:"flex items-center gap-1 text-sm text-slate-500",children:[s.jsx(ua,{className:"w-3 h-3"}),__prnmPublicLoc(c.location)]})'),
 # 5. product (listing detail) preview
 ('card_lg',
  'r.location.address&&s.jsxs("div",{className:"flex items-center gap-1.5 mt-2 text-slate-500",children:[s.jsx(ua,{className:"w-4 h-4"}),s.jsx("span",{className:"text-sm",children:r.location.address})]})',
  '__prnmPublicLoc(r.location)&&s.jsxs("div",{className:"flex items-center gap-1.5 mt-2 text-slate-500",children:[s.jsx(ua,{className:"w-4 h-4"}),s.jsx("span",{className:"text-sm",children:__prnmPublicLoc(r.location)})]})'),
 # 6. map placeholder
 ('mapph',
  'children:r.location.address||"Location not set"',
  'children:__prnmPublicLoc(r.location)||"Location shown after publishing"'),
 # 7. Search Results Preview -- the card in the host's screenshot
 ('srp',
  'location:f.location.address||"Your Location"',
  'location:__prnmPublicLoc(f.location)||"Location shown after publishing"'),
]
for name,old,new in EDITS:
    n=s.count(old)
    assert n==1, f"{name}: expected 1 anchor, found {n}"
    s=s.replace(old,new,1)
    print(f"  patched {name}")

# helper goes first so it is defined before the module body runs
s = HELPER + s

# these MUST survive untouched (private address retained, req 10 + 14)
KEEP=[
 ('privateData.exactAddress', 'privateData:{exactAddress:String(c.location&&c.location.address||"")}'),
 ('host review panel',        'children:[c.location.address||"No address set"'),
 ('address input value',      'value:c.location.address'),
 ('publish validation',       'c.location.address&&c.location.lat!=null&&c.location.lng!=null'),
]
for name,frag in KEEP:
    assert frag in s, f"REGRESSION: {name} lost"
    print(f"  preserved {name}")

# no public-location surface may still read .address
import re
assert 'location:f.location.address' not in s
assert 'children:r.location.address||"Location not set"' not in s
open(F,"w",encoding="utf-8").write(s)
os.chmod(F,0o644); sh(f"chown ubuntu:ubuntu {F}")
print(f"\nwritten: {len(orig)} -> {len(s)} bytes")
print("syntax check:", sh(f"cd /home/ubuntu/merlin && node --check {F} && echo OK") or "OK(no output)")
