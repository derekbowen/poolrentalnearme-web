"""EAST: idempotent Chatwoot setup for the PRNM assistant (ops/chatbot/ops/README.md). After cw_harden.py.
DRY=True: read-only. DRY=False: runs cw_setup.rb; bot token+secret go only to ENVF (600, ubuntu). Refuses until
cw_harden.py has set FRONTEND_URL and the three Active Record encryption keys (without them Chatwoot has no 2FA).
Reset links (D6): LINK_FOR = "derek" or "brandon" prints ONLY that founder's link, and only once the public URL
answers. Chatwoot does not enforce the 6 h expiry, so a link is live until used or revoked: every run revokes every
other outstanding reset token. After he sets his password, run again with LINK_FOR = "" (prints no link).
"""
import base64, hashlib, json, os, pwd, re, subprocess, sys, zlib

DRY = True
LINK_FOR = ""  # "" (print no link; revoke all) | "derek" | "brandon"
VERSION = "4.19.1"  # cw_harden.py's image
HOST = "chat.poolrentalnearme.com"
# Public URL on purpose: Chatwoot posts webhooks via SafeFetch, which refuses private and
# docker-gateway IPs. cw_harden.py pins HOST to EAST's public IP; cw_nginx.py routes /prnm-bot/.
BOT_URL = "https://%s/prnm-bot/webhook" % HOST
BD = "/home/ubuntu/chatbot"
ENVF = BD + "/.env"
SDK = "docker exec chatwoot-rails-1 cat /app/public/packs/js/sdk.js"
# cw_setup.rb, embedded zlib+base85 to fit the runner (selfcheck.py --embed writes and checks it)
RB_SHA = "21ff145b216667326852b053236c88803fa6501e833cf57e89d8109d75b3bb62"
RBZ = "c-oCvZByGw68_Gw=$N{-Rc8j+CD}yT9BbZosRNt>a=AK|QjMiCp0%V=Nh2Hw`0w}hjAR?)Y;7uWq?u{;`_tXCNtbnAk<KffD2gZ2&Wy2JrPOJ)wM+L}Qap<)W$Qu|bLy#Vq>@A>WGAXr@2OJhIG(6@%DY=zZky!Ts*+TqZ54=(x=iT<9bf!MjFpWiz3#`$i}UDUcpZJZJnIG<sm`a-*p&Xzjo&^yz4&)@GQ8~G3TvW@HmTdCN9rcvI(1K@Qs#-tyCI80!;51Yn>xon%_gQ&R4PbK{Ba!66_s^PMX7UJZ4}BBsRF;7f6Q*&7wL$9|DXdiQ#rY%UkhW>Qsq{rxsqk3L~OF#K7piRO$Yw}Kj=8svZ7{rJ>l(!jAIL)gE)qqR*ZF?M5B2xmzfHw`w>KR>8R)eWOS}z8~6dLbaG=!(ikdD*i|@_hP3(6e#-qmk@T-sA6uU)RkrIjo~sV&F`uv^*Xcg}@B{T)a`i=5w%Vu1M{;D%d*CI0d|b*Lmr7do>aS$(Q)*(F^0vyMfnyG}z0E}?3rY+<PSw0m{Fy$f48iueK~&?I6QDJX+X?-FfDh!Usw%4SNL0*lytDamrQ*6&mu&h>jAW%=zwPbq1W$6X`>KPuaZbs=Ox+_ks)?E9gkY<zDOK_wVN#?rM$mGob0jU}#<5|cdXSbrd{{)^K3&y?DhElXa|)fzfymXYvCE2DjqrUcWL3>fnS_vg`4+_{AL}xcR-2r+0?$)aQ(ZjUeARBqd&SQxPw*@2Wk4-0XUfPs3O0PzYoa1_&hNWm2&oR}fgZm+(ic%0mkOa|ZQ%G)!ZP&azAow_aSrE0;fpgYYtF8{FjkLs?Bu*s*6RH3F9eBn;$;y!@#46Z8n6C~0+^y=tCGmsE*huuj@jJY!kf9FtMluRIJikiuc@f3iJ;%v#p7{EjvJ()-Uu0E3I+Mtr;KawX=D<((J$2Sf2PWAMJK11SJ#vwu;d-ww!1^@86;7iBS0hz0(l+7Se6OpH88FuJ1<%kM94^Bpl8JrVIh_Cfd1)Le$9{}EEKX>2^!|H;$&{X3X!1iR>UN0XreR5RmZc(8%&9l(<(q*ffuEc5w;Q9@dSI2QE#36fuN7Fv^v&>Wbd>D0FpTkPfi?!I&KSDGdaZpSaH%yS|MtiZ#ayp3~@%y7gEejohCG@zkc;}#l+;w$q~x}#u9XmFhWX<fDqFKOGLSalmggm0Sz<c!C_N|UU-mZ8lSxwdK>q+E?H^oic3!iEVsr87hr)W>jdu+!Pabf3$tR5pBIx6b)wROdfHN<<7q`EPv-<hpdCN!Tmfqx^F&sYk%99Ar#2|qayT^}ix(lwqAem8rNX^KMOdnGp&2b=^xLi0_}}h4)8ViFI8uLFCC|SBfQlMl-8ND;U{Y@|oalUHzCdc9oBX1xZ>kh(GksR0N?VjC)P{vPr%bRY5HCPy9d-XZn!wX}u2L5T?jZ!lXPw+B`@PT4{3j!H8sIXqwy47G?b&Q5)|KLJ5O`fh!)k$YkZ9%@!EmVoOm;VSjt8%g-*uTs3R)FeZ5awXzjFb*OJzcHQ+E+`j0B>?S}l&sJB}iJ<}*icEOR>bK?f2S%=>iBtqJ~`x^&SBwC4s24n&BthE-hZ0&9I2vV&9M498V#4q4c&p+<Z}iG(~wsUpr4Zl|(H<#LoVdW~gT0opjzbY5#ak5KHQra<{khWj){_mf1ZmJ&@y$l(h;Kql%bq{l-hWPK|T-ZtVwjuK)Y>8A6Il{X*kQ>RazwJva*xAY|bG&=8f``v)KFEVHh7bA&%5<v)kqcZcSjyOqG+0+1Off*Cdhw44QBYvL+JM|<AI)cKKTPWxzy@ypDhLmax-ARegbfXP}*8SdI5xZd};TGm=wtZ1TfUvxa&AU=5hSrxxe-Y#{#EYuByjSyY+ymI2@)stEh3ds_(?<yh{xEy}=o9Xo8}7Ab->DXo`){S{KW%K%v4icU3909!o=`?tu#UshBR9^{E}b6$!GVTH2UMCF;up|txTiwbPQBk!Gm_~cw=8#8s=U{+Lhpa-n^or%zqgPTjfB-Q)nC;LzMK#KdwTxqJUTf&JB~hmJR1&<qN~&Y9e0C;m+oa+<LItyG^Z;TO65qU47(4&0N)XG>BGN}#K*h4M|*FP#NE1Nd~cQy-t8Xl9`bT?e9NobZ2x@t)8P1Mb(^&vBT1SAZ;pO^d-U!(kaf8Z$-J5Y4cZSaFr-`O$Zxa??as;TcgH&iU3i733S*|OILo;UYzB;2HOAxl1<fzXved8uRT9J0oG|IwtrS?ngzg0+PTYLO)c8mPmA8w~LB@JZ-E^!$Qf)Q)_<=Rr`+4teD-VB;s+rEvCoRd#B{?^Rpe|eLcYA}M4&E}gKe1#9?0KX!Ui=#!YJ;%WwWulB35UjD5x>U^ckmI)84s)@$;-B^6+L;Oi!#q5*V4Ktr=fpr%o~+z>=!(SX39=X;#XXB#Pdd3H>PlbJ9N$Bz}ixeYO9Xa*u}2N|AsQMrHU{^gfv}U$xOm^E_`0;+wH&!koXFlh$UH~D~v4jh*JjIPj6lefhoD{bt8^3Larc=wRO4Gj0*gZTVhNLoB(LG{)X(UReR7@Bp_>Brh=}Qal|r?M527HV)#WkTs4JjS<DtC%r)$;ed2D{jouD>nt57uTX`2rk5Ild>^)cF@e^#ciulH3J*upN;1WSxkB4}GqWI~P?;?4;iLJf|l3Xg-I1C3VChi1!rOK+_v&Aqx{C#l!c{sd|PA{&m2WMx4>(k*yG`u(%4la*QFMbO)PBiA-S&7D^*WI>RvE78B6@OMHhpQf-{Z!>n3IUU&H;degaK8{t!8u+^;h#}8QJk0_#a@+JNIT}u&Q7pl9PX_hv7Gj9$(K7`YdfY!famSdv&}wpchoEeXdATSRp$&|UUg63U!VA)j*HgK&aLCwT#u}5?B1??@I~E!E)oVRBNOrLOdmtam#8jyC(1@4ttml*H+$bND}CDA30eu3y?Y~|Xqp^U+gju+Q!ZbKG2|}$<29BK)=mXaEw^keBYBTrg6sTp<`KN!6#xCcJH=N63we4!gsUeok?>UoB)+-rqq(^^t|Ves=1RX9q<VW|_l@|G(+yAW#BR{shq$}D%3pd!i)#slmNrR*LZg#?DC95Bkjw5m%@02*QU$Y})hP>?kSW2iy-g8x#Z4MzTtoP7&YgDD{&uOkBb51^FXsFm9>&E5quk6y)2J98vWbfsKqTSX<^q!vjrpXx%M)L9(Q`Hmmf+oUmrPM}6$4Av3{-kd&2>(D@#q|4ZbE0sTl(b}x@m50I-3tG_m(G@!;9<Viz9z;`LvB@VH;pL*>3H&%~ziLFKp?A{jm8^BOLOi7xL!1BLT`Nqjg$A!n%$4btgr^tGV58?u0z9aZ6ffdDUA-5>n3kyx8K8py0U8ptV91L(UG)3@at1;Etl>E@+3Ju4(hZv~cv)+4w)M7of@"
RB = zlib.decompress(base64.b85decode(RBZ)).decode()


def sh(c, t=300, i=None):  # a timeout is a failed step (rc 124), never an exception that skips the cleanup
    try:
        r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, input=i, executable="/bin/bash")
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT after %d s" % t
    return r.returncode, (r.stdout + r.stderr).strip()


def q(c):
    return sh(c)[1]


def sri(c):  # D1: the public sha384 SRI of the bytes `c` prints (sdk.js), or None
    r = subprocess.run(c, shell=True, capture_output=True, timeout=60, executable="/bin/bash")
    ok = r.returncode == 0 and len(r.stdout) > 1000
    return "sha384-" + base64.b64encode(hashlib.sha384(r.stdout).digest()).decode() if ok else None


bad = [] if hashlib.sha256(RB.encode()).hexdigest() == RB_SHA else ["embedded ruby != cw_setup.rb"]
if LINK_FOR not in ("", "derek", "brandon"):
    bad.append("LINK_FOR must be '', 'derek' or 'brandon'")
fe = q("docker exec chatwoot-rails-1 printenv FRONTEND_URL")
if fe != "https://" + HOST:
    bad.append("FRONTEND_URL is %r: run cw_harden.py first" % fe)
# 2FA exists only with all three Active Record encryption keys (cw_harden.py writes them); presence only, never values
mk = q("docker exec chatwoot-rails-1 sh -c 'echo ${ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY:+k}"
       "${ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY:+k}${ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT:+k}'")
if mk != "kkk":
    bad.append("2FA unavailable: %d of 3 ACTIVE_RECORD_ENCRYPTION_* keys set in rails (cw_harden.py)" % mk.count("k"))
res = q("docker exec chatwoot-sidekiq-1 getent hosts " + HOST).split()[:1]
if not res or re.match(r"(10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168)\.", res[0]):
    bad.append("%s -> %s inside sidekiq; webhooks need EAST's public IP (cw_harden.py)" % (HOST, res))
syn = sh("docker exec -i chatwoot-rails-1 ruby -c", i=RB)[1]
if "Syntax OK" not in syn:
    bad.append("ruby: " + syn[-300:])
db = q("docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -Atc \"select (select count(*) from "
       "accounts),(select count(*) from users),(select count(*) from inboxes),(select string_agg(outgoing_url,' ') from agent_bots)\"")
onb = q("docker exec chatwoot-redis-1 redis-cli EXISTS alfred:CHATWOOT_INSTALLATION_ONBOARDING")
public = '"version":"%s"' % VERSION in q("curl -s -m 10 https://%s/api" % HOST)
link = LINK_FOR if public and not DRY else ""
sdk = sri(SDK)
print("FRONTEND_URL %s | 2FA keys %d/3 | sidekiq %s -> %s | db accounts|users|inboxes|bot urls: %s | onboarding open: %s "
      "| public URL answers: %s | reset link this run: %s | sdk.js SRI: %s" % (fe, mk.count("k"), HOST, res, db, onb, public,
                                                                            link or "none", sdk))
if LINK_FOR and not public:
    print("LINK_FOR=%s, but https://%s/api does not answer %s yet: no link is printed (run cw_nginx.py first)"
          % (LINK_FOR, HOST, VERSION))
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
if DRY:
    sys.exit("DRY RUN: nothing changed (ruby syntax OK; bot url would be %s)" % BOT_URL)
try:
    rc, out = sh("docker exec -i -e PRNM_LINK_FOR=%s -e PRNM_BOT_URL=%s chatwoot-rails-1 bundle exec rails runner -"
                 % (link or "''", BOT_URL), 400, RB)
    if rc == 124:  # the runner outlives a killed `docker exec`: stop it so it cannot write the file after the cleanup
        print("runner timed out; stopping it:", sh("docker exec chatwoot-rails-1 pkill -f 'rails runner -'", 30))
finally:  # bot token + webhook secret: read once, never left in the container
    sec = q("docker exec chatwoot-rails-1 sh -c 'cat /tmp/prnm_bot.json; rm -f /tmp/prnm_bot.json'")
line = [x for x in out.splitlines() if x.startswith("PRNM_OUT ")]
if rc or not line:
    sys.exit("FAILED (rc %d): %s" % (rc, out[-1500:]))
o = json.loads(line[-1][9:])
lk = o.pop("links", [])
print(json.dumps(o))
if o["feature_flags"] & 5 or str(o["max_upload_mb"]) != "1":
    print("WARN: widget feature_flags %s (attachments=1, end_conversation=4 must be off) | max upload %s MB"
          % (o["feature_flags"], o["max_upload_mb"]))
sec = json.loads(sec)  # bot token + webhook secret: written to ENVF, never printed
m = {"HOST": "127.0.0.1", "PORT": "3120", "CHATWOOT_URL": "http://127.0.0.1:3009",
     "CHATWOOT_FORWARDED_PROTO": "https", "CHATWOOT_PUBLIC_URL": "https://" + HOST,
     "SITE_URL": "https://www.poolrentalnearme.com", "CHATWOOT_ACCOUNT_ID": o["account_id"],
     "CHATWOOT_INBOX_ID": o["inbox_id"], "CHATWOOT_BOT_ID": o["bot_id"], "CHATWOOT_DEREK_USER_ID": o["derek_id"],
     "CHATWOOT_BRANDON_USER_ID": o["brandon_id"], "CHATWOOT_BOT_TOKEN": sec["token"],
     "CHATWOOT_WEBHOOK_SECRET": sec["secret"], "BOT_DATA_DIR": BD + "/data"}
u = pwd.getpwnam("ubuntu")
for d in (BD, BD + "/data"):
    os.makedirs(d, exist_ok=True)
    os.chmod(d, 0o700)
    os.chown(d, u.pw_uid, u.pw_gid)
keep = [x for x in open(ENVF).read().splitlines() if x.split("=")[0] not in m] if os.path.exists(ENVF) else []
fd = os.open(ENVF + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, ("\n".join(keep + ["%s=%s" % kv for kv in m.items()]) + "\n").encode())
os.close(fd)
os.chown(ENVF + ".tmp", u.pw_uid, u.pw_gid)
os.replace(ENVF + ".tmp", ENVF)
print("wrote %s mode %o (token/secret not shown) | onboarding page %s (302 = closed)" % (ENVF, os.stat(ENVF).st_mode & 0o777,
      q("curl -s -o /dev/null -w '%{http_code}' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/installation/onboarding")))
print("reset tokens revoked this run (nobody can use an older link): %s" % (", ".join(o["revoked"]) or "none outstanding"))
for e, k in lk:
    print("\n== ONE-TIME RESET LINK for %s = a credential. Hand it to him privately, now. It stays valid until used or "
          "revoked (Chatwoot does not enforce the 6 h expiry). After he sets his password he turns on 2FA: Profile "
          "Settings > Security, enable two-factor, scan the QR code, keep the backup codes (cw_status.py shows it per "
          "founder). Then run cw_setup.py with LINK_FOR = \"\" to revoke any copy.\n%s" % (e, k))
print("2FA available: %s | on for derek, brandon: %s" % (o.get("mfa_available"), o.get("mfa_on")))
print("DONE. Builds: VITE_CHATWOOT_WEBSITE_TOKEN=%s (public) VITE_CHATWOOT_SDK_SRI=%s (from the running image). "
      "EAST: east_widget.py reads the token from the DB." % (o["website_token"], sdk))
