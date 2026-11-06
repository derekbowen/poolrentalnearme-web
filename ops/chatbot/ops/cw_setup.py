"""EAST: idempotent Chatwoot setup for the PRNM assistant (ops/chatbot/ops/README.md). After cw_harden.py.
DRY=True: read-only. DRY=False: runs cw_setup.rb; bot token+secret go only to ENVF (600, ubuntu).
"""
import base64, hashlib, json, os, pwd, re, subprocess, sys, zlib

DRY = True
LINKS = True
HOST = "chat.poolrentalnearme.com"
# Public URL on purpose: Chatwoot posts webhooks via SafeFetch, which refuses private and
# docker-gateway IPs. cw_harden.py pins HOST to EAST's public IP; cw_nginx.py routes /prnm-bot/.
BOT_URL = "https://%s/prnm-bot/webhook" % HOST
BD = "/home/ubuntu/chatbot"
ENVF = BD + "/.env"
# cw_setup.rb, embedded zlib+base85 to fit the runner (selfcheck.py --embed writes and checks it)
RB_SHA = "4e39548368060c6b9d86493513a3ac7c60aee3b2abceca2d4a748ba87d7d0396"
RBZ = "c-oCuYj4{+68-L9F?Fz47S?4F;P#?bk?lH7x(zmUiX`2BFbsi~Xq&Yp3L+K98|T088A^7X*WFv74#nZ)%<If>k1p%Nk}j-H6(w`&md3cZmDHJidq_80QnHM#a&;-n74=j;QE94Da&uLwk7QLgP39_Du=MR)FD5y4sv?zYXG77ctBj85bod`JRW6zLg725ZZ}IWPb^PP<JP13bGG(T)WHbs+aOi@L%~BOXpMsP>|5+N7RjP0@E0nBqB@&ZEdR3RI8l<@{#(f$E$CWHnQ_yLqrRB|&X5zK&Kdh?8<Bm)chr0(!V(P+)sV>rZvg#EwR}lr@v6n9WW*TBQeN#XT>sUqI!Z?yNt(2X!0kI~FXzy-wl>faa*?ihQM11FFzQ)*gNl$r&6NSz`(Qm&|Z?j$9YU}JLTCY9S&3D)!Uauc8CzX;;z4<fDeacKCGZw?LVaHz%wHw=uT$Yp?TJs5gQaQZer$r{MU3Z9TEc6gI#_<cHW?je&icDEcHHJjx63e@LcULN@D|N{}$i+lj_3nM|_k-|W4i4XRX^*^j@;(*n2Ek(IW?7KIz?n*=AE{DhCKCh`haiFt6No~}bg}T)Fer~u6l&S3z5_qnXi;Lx(o|^#U=Lq$Vv4D*a_O`wSQIvg3cJwdBjKBkK;9@Gt0Kj(tRG_L!8E3d8(+XkZ+flcBk$k7_jg2fNO!cpUDK_ojF0+AatOn>m4xba?@t$XnR=h{qUgyQ##*rVhQ{fsPCU*l<(w{Ne*z@dX@f=Rw1MMiYJ4^)3M8{ioJwPFyLg((8DBFR!(D};t8drepDZkEJKwJR+j8W;VLrIjdRPq(4CuKiM~uEKftU2GV7a&c>;L@LX0=KmpMkKz4c5w;YL=C<ayrqaWIMgOcHC;%y1VYM!*ww+x6rV$9)BqNj4Hrt^ixf&cHjsk=ob1JZ`fw(ldyPccmEZwLC-~@5Zj;IL4+MYbvje-wd0q~kugXZx6GX@ZM46?TrS0nv>1ksuA;qa8;3x&^cTT!nL!{2dk3e3cc&i$z9Yk46+7)XSi4`<s!y{_rnEA3P$}Y4A-b&9cBz~plUebfC^?kKg3hokD|riUa`R7gJ=Z8qmP}nCBb-4#a&3XLLA9)*O)6bt4n_nM56*-)923V1SlFzQMl8jt1fH@|F_*V^YN|X|g`8vx(La@$1!o`{5EZp{s~CI}w-nL{IU%zQB`J+TSQ1Phai~KNY!meY=rPEJtj7YW;9_P|B)MDDsQb*ydw1@>+o$e}F7U!J-HTsF7rme#gnaup+oo_aIJHSQfY2kAn_oIEb+X`sTRcvIHf^PIGMRHS+0Mqj8@D!gh}pb5Nw+miD{kljj%OTO;jB{1r_vK+J_+6gU}9TWH){3F?4aTWpD>4y?GtHRq=W)^HfOzV66qWF7%vj8S1ls{XNPa^J9mhDt~S$YKu7;T=$;-Pp8Wovn}oWWLE(1#_`~7n!_U5VKo2AfyF}oot#BLeL0upe(e!L2U*3H<Jva{FHjkAHDKal%0yviwB+>sb4sGf<UmdbFWx}T!C@1-d53Y_ec#4~}iR5Wl)e4$1IWg^4MIQTl;z!OPBAVgE7;oW9O`C}(J#yvdCT(WC36j<L0sVrZf38uA^MP}fp43jAC}^QMtp0*Ja<eO5s8vLZ-I?5^OkvSu!rzEP4<K#GGZhcpQf<)?tYYR%F8!l-LX3s0dO^%Sp&%5AEH!dT|5vqjn*YO-T&mg2$Hx5y?7M_K*pLnNwhR;o4aNy$oQPC4G{lAMh=Qw@lOA|#%TDwaF$g-FPRSW+I$g|A+qjBggLj*qrgk&K-t+8@pRlu0q^T(zZM<i^=3J0=^B~+FCV3~~0gB?Mk46h*V!5|SoW4Q2U7}&PQ8dWV(WcNVQ%?0BO-9k@uY>EK7iitjhF8~v^Yg*=*~Kuv7#?2?E>F&e{|Y-_H2TS9g__d~_FZ1?w_)hSFKf7|zk~J*Rd^HvCP&$g{fzLx0H)xa2Bm1m$Sm*^?+1^oDv#*E{Bdv)b_`5@M=$m_UVA^)FdolsieU@jaix1C?DOq@H>1GbmehFGJA<cp-P0%kR%tpa=B?4e*x%W{LUsg)<DCN^8mLw*+Ufzit3|QX;PE4j>Gq-VctP**#n$W|Oo4X>o?xTq@pXPS{P$HbrXxh`VE`y*6me&5G4%|_s1|K6jjn#@8TaM#Vt9QzJZYYB_xrLe_mL&@{Y{g-&o97FzHg7Wjkh=N(cT?8YJ__)V&O|mLSG0QXzI4qSQFPSVSv4B6nEHWDKJ5QM=IUmJtm%<!cBxOLZPjB|Hr|hPp-0dmb%^q7eB7?ATyi5y6<-W2Uck*fd"
RB = zlib.decompress(base64.b85decode(RBZ)).decode()


def sh(c, t=300, i=None):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, input=i, executable="/bin/bash")
    return r.returncode, (r.stdout + r.stderr).strip()


def q(c):
    return sh(c)[1]


bad = [] if hashlib.sha256(RB.encode()).hexdigest() == RB_SHA else ["embedded ruby != cw_setup.rb"]
fe = q("docker exec chatwoot-rails-1 printenv FRONTEND_URL")
if fe != "https://" + HOST:
    bad.append("FRONTEND_URL is %r: run cw_harden.py first" % fe)
res = q("docker exec chatwoot-sidekiq-1 getent hosts " + HOST).split()[:1]
if not res or re.match(r"(10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168)\.", res[0]):
    bad.append("%s -> %s inside sidekiq; webhooks need EAST's public IP (cw_harden.py)" % (HOST, res))
syn = sh("docker exec -i chatwoot-rails-1 ruby -c", i=RB)[1]
if "Syntax OK" not in syn:
    bad.append("ruby: " + syn[-300:])
db = q("docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -Atc \"select (select count(*) from "
       "accounts),(select count(*) from users),(select count(*) from inboxes),(select string_agg(outgoing_url,' ') from agent_bots)\"")
onb = q("docker exec chatwoot-redis-1 redis-cli EXISTS alfred:CHATWOOT_INSTALLATION_ONBOARDING")
links = LINKS and not DRY and '"version":"4.16.2"' in q("curl -s -m 10 https://%s/api" % HOST)
print("FRONTEND_URL %s | sidekiq %s -> %s | db accounts|users|inboxes|bot urls: %s | onboarding open: %s | "
      "reset links this run: %s" % (fe, HOST, res, db, onb, links))
if bad:
    sys.exit("ABORT, nothing changed: " + "; ".join(bad))
if DRY:
    sys.exit("DRY RUN: nothing changed (ruby syntax OK; bot url would be %s)" % BOT_URL)
rc, out = sh("docker exec -i -e PRNM_LINKS=%d -e PRNM_BOT_URL=%s chatwoot-rails-1 bundle exec rails runner -"
             % (links, BOT_URL), 400, RB)
line = [x for x in out.splitlines() if x.startswith("PRNM_OUT ")]
sec = q("docker exec chatwoot-rails-1 sh -c 'cat /tmp/prnm_bot.json; rm -f /tmp/prnm_bot.json'")
if rc or not line:
    sys.exit("FAILED (rc %d): %s" % (rc, out[-1500:]))
o = json.loads(line[-1][9:])
lk = o.pop("links", None)
print(json.dumps(o))
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
if lk:
    print("\n== ONE-TIME RESET LINKS = credentials. Give each person theirs privately; single use; expire %s UTC."
          % o["expires_utc"])
    for e, k in lk:
        print(e, k)
print("DONE. WEST build: VITE_CHATWOOT_WEBSITE_TOKEN=%s (public). EAST: east_widget.py reads it from the DB."
      % o["website_token"])
