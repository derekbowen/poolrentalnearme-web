"""EAST: idempotent Chatwoot setup for the PRNM assistant (ops/chatbot/ops/README.md). After cw_harden.py.
DRY=True: read-only. DRY=False: runs cw_setup.rb; bot token+secret go only to ENVF (600, ubuntu). Refuses until
cw_harden.py has set FRONTEND_URL and the three Active Record encryption keys (no 2FA without them; 4.19: required).
Reset links (D6): LINK_FOR = "derek" or "brandon" prints ONLY that founder's link, and only once the public URL
answers. Chatwoot does not enforce the 6 h expiry, so a link is live until used or revoked: every run revokes every
other outstanding reset token. After he sets his password, run again with LINK_FOR = "" (prints no link).
"""
import base64, hashlib, json, os, pwd, re, subprocess, sys, zlib

DRY = True
LINK_FOR = ""  # "" (print no link; revoke all) | "derek" | "brandon"
# Derek decides. Bot down past Chatwoot's retries (~10 s; cw_nginx.py answers 500): "false" opens the chat with NO
# push (cw_status.py counts it), "true" keeps it with the bot (it answers the next message; not in the Open view).
KEEP_PENDING = ""  # "" leave as is (Chatwoot default: open) | "true" | "false"
VERSION = "4.19.1"  # cw_harden.py's image
HOST = "chat.poolrentalnearme.com"
# Public URL on purpose: Chatwoot posts webhooks via SafeFetch, which refuses private and
# docker-gateway IPs. cw_harden.py pins HOST to EAST's public IP; cw_nginx.py routes /prnm-bot/.
BOT_URL = "https://%s/prnm-bot/webhook" % HOST
BD = "/home/ubuntu/chatbot"
ENVF = BD + "/.env"
SDK = "docker exec chatwoot-rails-1 cat /app/public/packs/js/sdk.js"
# cw_setup.rb, embedded zlib+base85 to fit the runner (selfcheck.py --embed writes and checks it)
RB_SHA = "7fa56cc0d58884119ada8cffb65e323574695ff4407c13abeb276bf164c61387"
RBZ = "c-oCv`%~LU68_zPMF;9)tIi16JT_4_#~N@p)bdCHxm+FVQjMiCo><c8G$V``^S|HMBgqfqq_UMY()9F9KfmtQHeHsPA(c@y7Ivz&-6@1h%+5aDDM8URG}4y2pU<cx)1i!G83$x!GK$7Bn(+G0jw5(JU5_PA$FpFSt;;WYX~v<I#$v&5l|@4Dsek@&e<W=*?zBH$o}Yz>7uVtE%hR^kN>nxpN4lss-Bje$lk-2r4;Pp1fp2waXq(z?no}$bIl<pyA+lI!0a?hPGf9Pn1jI*SNf|22jPgQd)==m8wb#m}&J&3%ZvHX7sZKfO-@oWkPi0me{Clo-Qpn7TB$J{@r61{Z&?T_c7t&$%_b=)vN|;8D&5VPVh$4$Sdr_pz%=#mh#o=()$wVpxYJUO~T{<p02OFJ9m;?SWlD0B!Nze#-jo~hXJxM^@56w~T_mM>PYPukOHnM2eOFWw`QX}4B{Y)hX^!zz>8g_ZFj5P-|pOa&&-@QuW`FtsJR7hdvvmeRar9?*}VY1Ai!8ZN!p$CuruT+JMsq@m`fBVlaWm3k*IqU^Z<ji;h$*j;xiql9~%7rmgUBqP6ZMLJbcW&<xcCdN^7s0FYUZ%NqLi%MMJHcdz*okDAjs(J?D5b}0AJyUQV>y(W7$!1yCUCs4YOdi6s}DNC$^q|L_|+u%v)}&|e(IkepPc`JKyq;t%Sgr2c<(qQ6DjT_63VtF`C0(4a@Ik-F84&rJj`VltL!$^SqMeL5puCCU`RgfJ+)b#w$le8$S*V!iID?eWl>Vb@}M)xz0F$v;CN{1;sf$lY2l|Lr&!Y*Zh@cR=`P6>o98W}65CviG|}rQLAAl-4Ot?Mp%RZo`4ro?wjZu!gqtooJ5qlrjC}Q`^K#F76utdtTgYaYHz^0joh-<V^)z$*d>c$NbLzXKY|{Z<mANc>aSGfDoG_lB$!Q&vEArM-br-P|K%nJY80l=Jid0y|*pW}Y>Q3KGRK7-h))3%beuf?KE6QauFHNG0uu2jb=UJ!D$iTUz>k=`b(xV5O-_PmZN5C@-1%kCf(iOr2`X1fsi`d{z!IM2KYsNl1*H(>G<m9}P*22L*5F}J_C5x}(N*uRR;<Y-_2fEA1$~bhk3rC5#<!f#Ra8st~>g@UxHg41LD`H@O$C%Hl36z2pYY*n4uqslyU~z({Mc~Orj?~<P$ae2AKMpcZtx69((6=Opi_H{x8OXtO=e_U$=UA)VGG0FeVTBuv5w~(sOI?RR+2SBj*-+m@>dK=0BF#6rj{K)Da%hz0?48dS;+!zU0#cuZ$|mmacQiru&N7L3KdK)BaC}kmt+d}eep($Fq8#Ivv9-Agc6X=KslTaswLP!W)vvEw#3m$~x{F}AL?gJ{+k5@qtNz<I-;sb<hE`b);H{60C%1`+X{O6|A!&?^_P1E8#a3~Ps?Caj0c2AoGCIMwBxe@fWXA_+G=Tm1r^^CaVl{FUb%h;>y2u)us8Bi9U__LQ-ihxFSI9h>K^8V^pb#HnEFe!_$dJ1q?m5z?HUt&2qJ7Z_udGyd7NR2xYgnm>oTN#DejyG4UIJw~;P8bWVDrlfq{l<*i*n#2ylu$1io~~by4m{1%G(e2ajQ#P8(rXt1A6qoYL#``-L}WKFEVHZ7Xx3bB!Up?MyC3!3Ud`rWKn0XuvSE4&IiMWVGvsjb`-Q1UaRr*vYxU*LbmftMlI}9lPj!11h7C0;%y-%1He<OK8fN8_lKq|?&Rzn`va#Ze8L#cHczN^-SQ>WV!M{}Dx=Q0Bi)F`PPKsCpA|5EM48{GvqLy6NBc+&VY3x`y{nr@Jw*fpbTva9YJ2OX>cpJ+j<{Ydp%+MPl}Oazas>*`djB~&`+OFDI63WypFf>m^p3-;lmGVH-ooB@A}O(T-*r)w6<rfClnEo`1Jaet<!IEV_y0n^_4oIWU%o-Uwaelb;?~QDZ}*S(k9fJ>z614g8Q0`rk6!fp$E##kYlL{NH@rUn<<0Tib<Am_Z`cu;nIdtUgBI!DE;FPeCWD6Z;nmyz-eDW|<(64%_9RNf%*7z*b|h=#afgn!fkaU#Sb&Vca4@5>Hg+dLS~H`2K@%U<r|1%g)TlOC1Obw(veeC%)rkL{I(6Q&MlXMT`KFPFk0UcxX^IS4uop{quDakZ8t%6*doK>(Fn6_Mc_m<CPN%&16D>duhSv1}39j=UaN>&S9bUNi;Rem1sT>Mkc8%U+C3Ie7Y3O<e_vAFJ9&7W4g&b8272KuLj&)qExaf#xwX&|k<63l78enM8+CmLWE05*K#jehNLK)F;g=o^yr>?G~I_8oTtQX~m>^TAAsu;%pk}XyyPsA+bl!5k>n^(S%hPmjpLyj>*t{{$;b-7jdV*Ec(2584P0S>kO3E5W*Y_BOE)LB#%uU*MFWEqD(dVE(_7%34BS9Oh9)}2MQp^r!?pu}i|QKgzIU29Yii+;P2caii6<y+0(bJZ9>UaL{0>Jc`h$|{^K5kxR2H~0ZhOI?C+wlv&7MpoScNiHR990a`t<75oI5@}^;Z7~RrKK8D^Two|aIlsE@ou2ltPcF{Gi}S;a-X+g4Uh9Lxq%bYeLv-4^HqCeIFtq+xqcgbbp&Hbj6h2IjHY#*0zWaq>63(fl^s8qSIFuRYM_rah8ql78y|?GJw8OoPJ*?B-Emeh!*P7<07GS+|StEA&cE`<9fVW0FUUkmk<yH4|t8W8U*UaVTW^dr`tY`lf!v0|8z$YboU8F)LTEza^o-U>0J}h&lgy}G#KN39@NmXX9WO1h==`*qO{j$;}3|Wl?%Qm|f(69Ru)Xmb*R>lY(co}k+t?UNNdm9`0$L2O3w8b5|0<PG><^jCxcJb`Bkf-xJSl!`u-A5cqd^6~xgS*qNB;sY|ntEbyM5~Qyi`m*Rf8g;D$za;0)oHlqa@&6}B`>&Lx6r6lk301>)#r@r+mpP{RRKuUS>nc{>SL7q1_jW_&`KaLX9ml6a`l^(|F_CJ&K%wnr#o&E59_fOMkyJS)QIZQxcO%0jG}J>XR`tQ_8Z;Q6EJ4*l}~OTE-%in`{&2iC%4C4^aZ=Xz42}{8t(!P?19rHT#U;uVcu^)U=D_fIsp?mZShbs8JH6T3CqSGn|As+uV(h3p06ti<36%XGt=3`f&riPc|zhtP+J_)YphU*i?f3>!%DTtxp~-fpJpyTU(@!3Zjk43tMz{>nloM"
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
if LINK_FOR not in ("", "derek", "brandon") or KEEP_PENDING not in ("", "true", "false"):
    bad.append("LINK_FOR must be '', 'derek' or 'brandon'; KEEP_PENDING '', 'true' or 'false'")
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
    rc, out = sh("docker exec -i -e PRNM_LINK_FOR=%s -e PRNM_KEEP_PENDING=%s -e PRNM_BOT_URL=%s chatwoot-rails-1 bundle "
                 "exec rails runner -" % (link or "''", KEEP_PENDING or "''", BOT_URL), 400, RB)
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
mf = ("he signs in at https://%s/app/login and Chatwoot makes him set up 2FA there (2FA is required for this account)"
      % HOST if o.get("mfa_enforced") else "he turns on 2FA: Profile Settings > Security, enable two-factor")
for e, k in lk:
    print("\n== ONE-TIME RESET LINK for %s = a credential. Hand it to him privately, now. It stays valid until used or "
          "revoked (Chatwoot does not enforce the 6 h expiry). After he sets his password %s: scan the QR code, keep "
          "the backup codes; only then the mobile app (it asks for the code). Then run cw_setup.py with LINK_FOR = \"\" "
          "to revoke any copy.\n%s" % (e, mf, k))
print("2FA available: %s | enforced: %s | on for derek, brandon: %s | keep chats with the bot when its webhook fails: "
      "%s" % (o.get("mfa_available"), o.get("mfa_enforced"), o.get("mfa_on"), o.get("keep_pending")))
print("DONE. Builds: VITE_CHATWOOT_WEBSITE_TOKEN=%s (public) VITE_CHATWOOT_SDK_SRI=%s (from the running image). "
      "EAST: east_widget.py reads the token from the DB." % (o["website_token"], sdk))
