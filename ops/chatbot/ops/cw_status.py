"""EAST: read-only status of Chatwoot + the PRNM chatbot (ops/chatbot/ops/README.md).

python3 ops/runners/east_runx.py ops/chatbot/ops/cw_status.py
Changes nothing. Never prints a secret: secret env vars are shown only as set/unset,
pm2 output is parsed and reduced to a few fields, the bot .env shows key names only,
and no message content is read from the database.
"""
import json, os, shlex, subprocess

HOST = "chat.poolrentalnearme.com"
B = "/home/ubuntu/chatbot"
SHOW = ("FRONTEND_URL", "ENABLE_ACCOUNT_SIGNUP", "FORCE_SSL", "ENABLE_PUSH_RELAY_SERVER", "DISABLE_TELEMETRY",
        "CW_EDITION", "ACTIVE_STORAGE_SERVICE")
SECRET = ("SAFE_FETCH_ALLOW_PRIVATE_NETWORK", "CAPTAIN_OPEN_AI_API_KEY", "FIREBASE_PROJECT_ID", "FIREBASE_CREDENTIALS",
          "SMTP_ADDRESS", "SMTP_PASSWORD")


def sh(c, t=60):
    r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=t, executable="/bin/bash")
    return (r.stdout + r.stderr).strip()


def sql(title, x):
    print("--", title)
    print(sh("docker exec chatwoot-postgres-1 psql -U postgres -d chatwoot_production -AtF ' | ' -c " + shlex.quote(x)))


def code(a):
    return sh("curl -s -o /dev/null -w '%%{http_code}' -m 10 %s" % a)


print("== containers")
print(sh("docker ps -a --filter name=chatwoot --format '{{.Names}} | {{.Image}} | {{.Status}}'"))
print("api:", sh("curl -s -m 10 -H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/api"))
print("== rails env (non-secret values; others set/unset only)")
have = dict(x.split("=", 1) for x in sh("docker exec chatwoot-rails-1 env").splitlines() if "=" in x)
print(" | ".join("%s=%s" % (k, have.get(k, "(unset)")) for k in SHOW))
print(" | ".join("%s %s" % (k, "set" if have.get(k) else "unset/empty") for k in SECRET))
print("sidekiq resolves %s ->" % HOST, sh("docker exec chatwoot-sidekiq-1 getent hosts " + HOST) or "(nothing)")
print("onboarding key:", sh("docker exec chatwoot-redis-1 redis-cli EXISTS alfred:CHATWOOT_INSTALLATION_ONBOARDING"),
      "| /installation/onboarding:", code("-H 'X-Forwarded-Proto: https' http://127.0.0.1:3009/installation/onboarding"),
      "(302 = closed)")
sql("signup row", "select serialized_value::text from installation_configs where name='ENABLE_ACCOUNT_SIGNUP'")
sql("accounts", "select id, name from accounts")
sql("users (id | name | email | type | role 1=admin)",
    "select u.id, u.name, u.email, coalesce(u.type,'User'), au.role from users u left join account_users au on au.user_id=u.id")
sql("website inbox (id | name | auto-assign | email-collect | feature_flags | reply_time | continuity | token)",
    "select i.id, i.name, i.enable_auto_assignment, i.enable_email_collect, w.feature_flags, w.reply_time, "
    "w.continuity_via_email, w.website_token from inboxes i join channel_web_widgets w on i.channel_type="
    "'Channel::WebWidget' and w.id=i.channel_id")
sql("inbox members (inbox | user)", "select inbox_id, user_id from inbox_members order by 1, 2")
sql("agent bots (id | name | outgoing_url | inbox | status 0=active)",
    "select b.id, b.name, b.outgoing_url, abi.inbox_id, abi.status from agent_bots b "
    "left join agent_bot_inboxes abi on abi.agent_bot_id=b.id")
sql("notification flags (user | email_flags | push_flags)", "select user_id, email_flags, push_flags from notification_settings")
sql("devices registered for push (user | type 1=browser 2=app | n)",
    "select user_id, subscription_type, count(*) from notification_subscriptions group by 1, 2 order by 1, 2")
print("== conversations and handoffs")
sql("conversations by status (0 open, 1 resolved, 2 pending/bot, 3 snoozed)",
    "select status, count(*) from conversations group by 1 order by 1")
sql("handoffs = conversations labelled 'handoff': last 24 h | last 7 d | all",
    "select count(*) filter (where c.created_at > now() - interval '1 day'), count(*) filter (where c.created_at > "
    "now() - interval '7 days'), count(*) from conversations c join taggings t on t.taggable_type='Conversation' "
    "and t.taggable_id=c.id and t.context='labels' join tags g on g.id=t.tag_id and g.name='handoff'")
sql("last 5 handoffs (conv # | created | priority 3=urgent | assignee | status)",
    "select c.display_id, c.created_at, c.priority, c.assignee_id, c.status from conversations c join taggings t on "
    "t.taggable_type='Conversation' and t.taggable_id=c.id and t.context='labels' join tags g on g.id=t.tag_id and "
    "g.name='handoff' order by c.created_at desc limit 5")
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
except ValueError:
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
print("cert:", sh("openssl x509 -enddate -noout -in /etc/letsencrypt/live/%s/fullchain.pem 2>&1" % HOST))
print("public https://%s/api:" % HOST, code("https://%s/api" % HOST), "| sdk.js:", code("https://%s/packs/js/sdk.js" % HOST))
print("== capacity")
print(sh("free -m | sed -n 1,3p; df -h / | tail -1; uptime"))
print(sh("docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'"))
print("== backups:", sh("ls -1 /home/ubuntu/chatwoot-backups 2>&1 | tail -5"))
