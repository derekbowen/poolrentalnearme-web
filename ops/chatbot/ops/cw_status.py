"""EAST: read-only status of Chatwoot + the PRNM chatbot (ops/chatbot/ops/README.md).

python3 ops/runners/east_runx.py ops/chatbot/ops/cw_status.py
Changes nothing. Never prints a secret: secret env vars are shown only as set/unset,
pm2 output is parsed and reduced to a few fields, the bot .env shows key names only,
and no message content is printed (one count matches Chatwoot's own bot-error activity text).
"""
import base64, hashlib, json, os, shlex, subprocess

HOST = "chat.poolrentalnearme.com"
B = "/home/ubuntu/chatbot"
ALERT_GB = 2.0  # DISK ALERT below this much free space on / (Postgres, uploads, logs and fresh-web share it)
EXPECT_SRI = "sha384-NMOiMrdTUxTmFY1l+sFGdJGBULpsENmHiq+1biXcN6oREUhlYB9ij9AFbm5/I3Xr"  # v4.19.1-ce sdk.js
SHOW = ("FRONTEND_URL", "ENABLE_ACCOUNT_SIGNUP", "FORCE_SSL", "ENABLE_PUSH_RELAY_SERVER", "DISABLE_TELEMETRY",
        "CW_EDITION", "ACTIVE_STORAGE_SERVICE", "RATE_LIMIT_WIDGET_CONVERSATIONS", "RATE_LIMIT_WIDGET_MESSAGES",
        "RATE_LIMIT_WIDGET_LOAD")
AR = ("ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY", "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY",
      "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT")  # 2FA exists only with all three (values never printed)
SECRET = ("SAFE_FETCH_ALLOW_PRIVATE_NETWORK", "CAPTAIN_OPEN_AI_API_KEY", "FIREBASE_PROJECT_ID", "FIREBASE_CREDENTIALS",
          "SMTP_ADDRESS", "SMTP_PASSWORD", "OPENSEARCH_URL", "ENABLE_SIDEKIQ_CLOUDWATCH")
LBL = ("select g.name, count(*) filter (where t.created_at > now() - interval '1 day'), count(*) filter (where "
       "t.created_at > now() - interval '7 days'), count(*) from taggings t join tags g on g.id=t.tag_id where "
       "t.taggable_type='Conversation' and t.context='labels' and g.name in ('handoff','urgent','handoff-capped',"
       "'handoff-overflow') group by 1 order by 1")
ALERT = "private and sender_type = 'AgentBot' and content like '%(mention://user/%'"  # only a founder alert has one


def sh(c, t=60):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    return (r.stdout + r.stderr).strip()


def sql(title, x):
    print("--", title)
    print(sh("docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -AtF ' | ' -c " + shlex.quote(x)))


def code(a):
    return sh("curl -s -o /dev/null -w '%%{http_code}' -m 10 %s" % a)


def sri(c):  # D1: sha384 SRI of the bytes a command prints, with their size
    r = subprocess.run(c, shell=True, capture_output=True, timeout=60, executable="/bin/bash")
    b = r.stdout if r.returncode == 0 else b""
    return ("sha384-" + base64.b64encode(hashlib.sha384(b).digest()).decode(), len(b)) if len(b) > 1000 else (None, len(b))


print("== containers")
print(sh("docker ps -a --filter name=chatwoot --format '{{.Names}} | {{.Image}} | {{.Status}}'"))
print("api:", sh("curl -s -m 10 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/api"))
print("== rails env (non-secret values; others set/unset only)")
have = dict(x.split("=", 1) for x in sh("docker exec chatwoot-rails-1 env").splitlines() if "=" in x)
print(" | ".join("%s=%s" % (k, have.get(k, "(unset)")) for k in SHOW))
print(" | ".join("%s %s" % (k, "set" if have.get(k) else "unset/empty") for k in SECRET))
ks = [have.get(k, "") for k in AR]
print("2FA available (%d of 3 encryption keys set): %s | key fingerprint %s (cw_harden.py printed it; match the off-box "
      "backup)" % (sum(map(bool, ks)), all(ks), hashlib.sha256("".join(ks).encode()).hexdigest()[:12] if all(ks) else "-"))
print("sidekiq resolves %s ->" % HOST, sh("docker exec chatwoot-sidekiq-1 getent hosts " + HOST) or "(nothing)")
print("onboarding key:", sh("docker exec chatwoot-redis-1 redis-cli EXISTS alfred:CHATWOOT_INSTALLATION_ONBOARDING"),
      "| /installation/onboarding:", code("-H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/installation/onboarding"),
      "(302 = closed)")
sql("installation config rows (they win over env): signup, attachment limit MB",
    "select name, replace(serialized_value #>> '{}', E'\\n', ' ') from installation_configs where name in "
    "('ENABLE_ACCOUNT_SIGNUP', 'MAXIMUM_FILE_UPLOAD_SIZE') order by 1")
sql("schema_migrations max", "select max(version) from schema_migrations")
sql("accounts (id | name | enforce 2FA | keep chats with the bot when its webhook fails)",
    "select id, name, settings->>'enforce_mfa', settings->>'keep_pending_on_bot_failure' from accounts")
sql("users (id | name | email | type | role 1=admin | reset token outstanding | 2FA on)",
    "select u.id, u.name, u.email, coalesce(u.type,'User'), au.role, u.reset_password_token is not null, "
    "u.otp_required_for_login from users u left join account_users au on au.user_id=u.id")
sql("website inbox (id | name | auto-assign | email-collect | flags | attachments | end_conversation | reply_time | "
    "continuity | token)",
    "select i.id, i.name, i.enable_auto_assignment, i.enable_email_collect, w.feature_flags, (w.feature_flags & 1) > 0, "
    "(w.feature_flags & 4) > 0, w.reply_time, w.continuity_via_email, w.website_token from inboxes i join "
    "channel_web_widgets w on i.channel_type='Channel::WebWidget' and w.id=i.channel_id")
sql("inbox members (inbox | user)", "select inbox_id, user_id from inbox_members order by 1, 2")
sql("agent bots (id | name | outgoing_url | inbox | status 0=active)",
    "select b.id, b.name, b.outgoing_url, abi.inbox_id, abi.status from agent_bots b "
    "left join agent_bot_inboxes abi on abi.agent_bot_id=b.id")
sql("notification flags (user | email_flags | push_flags)", "select user_id, email_flags, push_flags from notification_settings")
sql("devices registered for push (user | type 1=browser 2=app | n)",
    "select user_id, subscription_type, count(*) from notification_subscriptions group by 1, 2 order by 1, 2")
sql("contacts (total | new 24 h | new 7 d | contact_inboxes): each /widget load without a valid cw_conversation makes "
    "one (cw_nginx.py: 10/min per IP)",
    "select count(*), count(*) filter (where created_at > now() - interval '1 day'), count(*) filter (where created_at "
    "> now() - interval '7 days'), (select count(*) from contact_inboxes) from contacts")
print("== conversations and handoffs")
sql("conversations by status (0 open, 1 resolved, 2 pending/bot, 3 snoozed)",
    "select status, count(*) from conversations group by 1 order by 1")
sql("labels applied (label | 24 h | 7 d | all): capped/overflow = D3 limit hit, no alert. A visitor can preset any label "
    "on his own new chat (4.19.1 widget messages#create), so labels do not prove an alert: the next line does", LBL)
sql("founder alerts = bot notes that @mention Derek and Brandon (notes 24 h | 7 d | all | chats); visitors cannot write "
    "notes", "select count(*) filter (where created_at > now() - interval '1 day'), count(*) filter (where created_at > "
    "now() - interval '7 days'), count(*), count(distinct conversation_id) from messages where " + ALERT)
sql("bot-failure opens (24 h | 7 d): webhook failed past Chatwoot's retries, chat opened with NO push; check the bot "
    "(always 0 while the account keeps chats with the bot on failure: cw_setup.py KEEP_PENDING, accounts row above)",
    "select count(*) filter (where created_at > now() - interval '1 day'), count(*) filter (where created_at > now() - "
    "interval '7 days') from messages where message_type=2 and content='Conversation was marked open by system due to "
    "an error with the agent bot.'")
sql("last 5 founder alerts (conv # | last alert | priority 3=urgent | assignee | status)",
    "select c.display_id, max(m.created_at), c.priority, c.assignee_id, c.status from conversations c join messages m on "
    "m.conversation_id=c.id and m." + ALERT.replace(" and ", " and m.") + " group by c.id order by 2 desc limit 5")
sql("notifications last 7 d (user | type 1=new conversation 4=mention 2=assigned 3/5=new message | n)",
    "select user_id, notification_type, count(*) from notifications where created_at > now() - interval '7 days' "
    "group by 1, 2 order by 1, 2")
print("== chatbot")
try:
    j = sh("cd /home/ubuntu && sudo -u ubuntu bash -lc 'PM2_HOME=/home/ubuntu/.pm2 pm2 jlist'")
    for p in json.loads(j.splitlines()[-1]):
        if p.get("name") == "chatbot":
            e = p.get("pm2_env", {})
            print("pm2 chatbot:", e.get("status"), "| restarts", e.get("restart_time"), "| mem MB",
                  int((p.get("monit") or {}).get("memory", 0) / 2**20), "| script", e.get("pm_exec_path"))
except (ValueError, IndexError):
    print("pm2 jlist unreadable")
print("healthz:", code("http://127.0.0.1:3120/healthz"), "| listening:", sh("ss -ltnH 'sport = :3120'") or "nothing")
print("current ->", os.path.realpath(B + "/current") if os.path.islink(B + "/current") else "(none)")
if os.path.exists(B + "/.env"):
    st = os.stat(B + "/.env")
    keys = [x.split("=", 1)[0] for x in open(B + "/.env").read().splitlines() if "=" in x]
    print(".env mode %o uid %d keys: %s" % (st.st_mode & 0o777, st.st_uid, " ".join(keys)))
print("data files (name | bytes | lines):", sh("cd %s/data 2>/dev/null && for f in $(find . -type f | head -20); do "
                                               "echo \"$f $(stat -c %%s $f) $(wc -l < $f)\"; done" % B) or "(none)")
print("== nginx / tls")
print(sh("ls -la /etc/nginx/sites-enabled/; nginx -t 2>&1 | tail -1"))
vh = "/etc/nginx/sites-enabled/zz-chat-prnm.conf"
vt = open(vh).read() if os.path.exists(vh) else ""
print("chat vhost has: load zone %s | widget contact/labels read-only %s | bot down -> 500 %s" % tuple(
    x in vt for x in ("zone=prnm_wload", "(contact|labels|", "=500 @prnm_bot_down")))
print("DNS %s (proxied = Cloudflare addresses only, cw_nginx.py):" % HOST,
      sorted({x.split()[0] for x in sh("getent ahosts " + HOST).splitlines() if x.strip()}) or "none")
print("cert:", sh("openssl x509 -enddate -noout -in /etc/letsencrypt/live/%s/fullchain.pem 2>&1" % HOST))
print("public https://%s/api:" % HOST, code("https://%s/api" % HOST), "| sdk.js:", code("https://%s/packs/js/sdk.js" % HOST))
print("== D1 sdk.js SRI (VITE_CHATWOOT_SDK_SRI must equal the container's; v4.19.1-ce is %s)" % EXPECT_SRI)
box = sri("docker exec chatwoot-rails-1 cat /app/public/packs/js/sdk.js")
served = sri("curl -s -m 10 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/packs/js/sdk.js")
pub = sri("curl -s -m 10 'https://%s/packs/js/sdk.js'" % HOST)
show = lambda x: "same" if x == box else ("%s (%d bytes)" % x if x[0] else "unreachable")  # noqa: E731
print("container file: %s (%d bytes)\nserved on :3009: %s | public: %s (a public copy that differs = stale edge "
      "cache: purge it)" % (box[0], box[1], show(served), show(pub)))
acao = [x.strip() for x in sh("curl -s -o /dev/null -D - -m 10 -H 'Origin: https://www.poolrentalnearme.com' "
                              "https://%s/packs/js/sdk.js" % HOST).lower().splitlines() if x.startswith("access-control-allow-origin")]
print("public sdk.js Access-Control-Allow-Origin (need exactly one '*'):", acao or "none")
print("== capacity")
print(sh("free -m | sed -n 1,3p; df -h / | tail -1; uptime"))
vfs = os.statvfs("/")
gb = vfs.f_bavail * vfs.f_frsize / 2**30
print(("DISK ALERT: %.1f GB free on / (alert under %.1f GB): find what grew below" if gb < ALERT_GB else
       "disk OK: %.1f GB free on / (alert under %.1f GB)") % (gb, ALERT_GB))
print("MB used:", sh("du -sm /var/lib/docker/volumes/chatwoot_cw_storage/_data /var/lib/docker/volumes/chatwoot_cw_pg/_data "
                     "/var/lib/docker/containers /home/ubuntu/.pm2/logs /var/log/nginx %s/data /home/ubuntu/chatwoot-backups "
                     "2>/dev/null | tr '\\n' ' '" % B), "| docker log driver (containers = their logs):",
      sh("docker info --format '{{.LoggingDriver}}'"))
print(sh("docker system df --format '{{.Type}} {{.Size}} (reclaimable {{.Reclaimable}})' | tr '\\n' ';'"))
print(sh("docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'"))
print("== backups:", sh("ls -1 /home/ubuntu/chatwoot-backups 2>&1 | tail -5"))
