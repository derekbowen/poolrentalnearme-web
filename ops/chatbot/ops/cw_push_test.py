"""EAST: test Chatwoot app notifications for BOTH founders (ops/chatbot/ops/README.md). No customer is involved.

python3 ops/runners/east_runx.py ops/chatbot/ops/cw_push_test.py
DRY=True (default): lists Derek's and Brandon's registered devices (1 = browser push, 2 = Chatwoot mobile
app) and their push flags; sends nothing. DRY=False: sends Chatwoot's own test push (the same service as
Super Admin > Push diagnostics) to every registered device of both, and prints each device's result.
Free: browser push goes straight to the browser vendor; the official app goes through Chatwoot's relay.
D5, the push flags cw_setup.rb sets (creation, mention, assignment, assigned new message): a handoff pushes each
founder twice, creation (body = the customer's FIRST message, 10 words, not redacted by the bot: a card number typed
there goes out through the push relay) and the @mention. Participating-conversation pushes stay off: the @mention
makes both founders participants, so every later message would buzz both phones, uncapped. Instead later messages
push no one until a founder assigns the chat to himself (the note asks); then each one pushes him (10 words,
unredacted). Auto-assignment stays off (it picks only agents online in the dashboard). To silence a troll: block the
contact. Bot down: cw_nginx.py answers 500, which Chatwoot retries (3 tries, 3 s apart), so a restart is covered;
past that Chatwoot opens the chat with NO push (cw_status.py "bot-failure opens"), or keeps it with the bot if
cw_setup.py KEEP_PENDING = "true".
2FA is required for the account (cw_setup.rb, 4.19.1): each founder enrolls on the web first (sign in at
https://chat.poolrentalnearme.com/app/login, scan the QR code); the mobile app then logs in with the code.
"""
import json, subprocess, sys

DRY = True
RB = r'''
dry = ENV['PRNM_DRY'] == '1'
%w[derek@poolrentalnearme.com brandon@poolrentalnearme.com].each do |e|
  u = User.find_by(email: e)
  next puts("PRNM_OUT #{{ email: e, missing: true }.to_json}") unless u
  subs = u.notification_subscriptions.order(:id)
  res = dry || subs.empty? ? [] : Notification::PushTestService.new(
    user: u, subscription_ids: subs.ids, title: 'PRNM chat: test notification',
    body: 'Test from cw_push_test.py. If you can read this, chat handoffs reach this device.'
  ).perform
  puts "PRNM_OUT #{{ email: e, user_id: u.id, devices: subs.map { |s| [s.id, s.subscription_type] },
                    push_flags: u.notification_settings.first&.selected_push_flags,
                    results: res.map { |r| r.slice(:id, :type, :device, :status).merge(message: r[:message].to_s[0, 160]) } }.to_json}"
end
'''
r = subprocess.run("docker exec -i -e PRNM_DRY=%d chatwoot-rails-1 bundle exec rails runner -" % DRY, shell=True,
                   capture_output=True, text=True, input=RB, timeout=300)
rows = [json.loads(x[9:]) for x in r.stdout.splitlines() if x.startswith("PRNM_OUT ")]
if r.returncode or len(rows) != 2:
    sys.exit("FAILED (rc %d): %s" % (r.returncode, (r.stdout + r.stderr)[-1200:]))
ok = True
for row in rows:
    print(json.dumps(row))
    if row.get("missing") or not row["devices"]:
        print("  -> %s has no registered device yet: set up 2FA on the web first, then install the Chatwoot app, "
              "connect to chat.poolrentalnearme.com, log in (it asks for the 2FA code) and allow notifications (or "
              "enable browser push in Profile Settings)" % row["email"])
        ok = False
    elif not DRY and not all(x["status"] == "success" for x in row["results"]):
        ok = False
if DRY:
    sys.exit("DRY RUN: nothing sent")
print("both founders' devices accepted the test push" if ok else "NOT OK: see the rows above")
print("Next, end to end: open the site in a private window, open the chat, type 'can I talk to the founder' -> both "
      "phones get the mention push; one founder assigns the conversation to himself before replying.")
sys.exit(0 if ok else 1)
