#!/usr/bin/env python3
"""
One-off broadcast: "Pool Rental Near Me update from CEO" (Derek's letter, verbatim).

Runs on WEST. Approved shape (Derek, 2026-10-02): Emailit from noreply@, reply-to
derek@poolrentalnearme.com, hosts first then customers, VERIFIED addresses only in
this phase, compliance footer (unsubscribe + postal address) under the letter.

Modes
  render  local/WEST: write preview.html / preview.txt only (no network)
  dry     WEST: build the exact ordered recipient list from the audience file,
          re-check suppression live, print counts. Sends nothing, writes nothing.
  test    WEST: send ONE copy to derek@poolrentalnearme.com only, then report its
          Emailit status.
  send    WEST: send to the list. Requires CONFIRM=GO-<n> where <n> is exactly the
          number this run would send. Resumable (never re-sends an address in the
          log), kill switch /home/ubuntu/broadcast/STOP, <=2 msg/s with 429 back-off,
          suppression re-read every 100, bounce guard: after every 100 sends, statuses
          of messages >=3 min old are fetched; stops if bounced+failed > 5%.

Exclusions are applied by audience.py (deleted, banned, no email, suppression,
do-not-contact: both "James Martin" accounts incl. Cypress River Oasis) and again
here (junk/disposable domains, live suppression).
"""
import html, json, os, re, secrets, sys, time, urllib.error, urllib.parse, urllib.request, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = '/home/ubuntu/broadcast'
AUDIENCE = f'{BASE}/ceo_update_audience.json'
LETTER = os.environ.get('LETTER', f'{BASE}/letter.txt' if os.path.exists(f'{BASE}/letter.txt') else f'{HERE}/letter.txt')
LOG = f'{BASE}/ceo_update_send_log.jsonl'
STOP = f'{BASE}/STOP'

CAMPAIGN = 'ceo_update_2026_10'
SUBJECT = 'Pool Rental Near Me update from CEO'
FROM = 'Derek Bowen <noreply@poolrentalnearme.com>'
REPLY_TO = 'derek@poolrentalnearme.com'
TEST_TO = 'derek@poolrentalnearme.com'
POSTAL = 'Pool Rental Near Me · 10,000 Solutions LLC · 2261 Market Street #5429, San Francisco, CA 94114'
ORIGIN = 'https://www.poolrentalnearme.com'
EMAILIT = 'https://api.emailit.com/v2/emails'
SEGMENT_ORDER = ['1 host: has a published listing', '2 host: listing not published',
                 '3 host signup: provider, no listing', '4 customer']
JUNK = re.compile(r'@(?:mailinator|yopmail|guerrillamail|sharklasers|10minutemail|tempmail|temp-mail|'
                  r'trashmail|dispostable|getnada|maildrop|throwawaymail|mailnesia|fakeinbox)\.|@example\.(?:com|org|net)$', re.I)
PACE_S = 0.6
BOUNCE_STOP = 0.05


# ---------------------------------------------------------------- rendering
def paragraphs():
    text = open(LETTER, encoding='utf-8').read().strip('\n')
    return [p for p in re.split(r'\n\s*\n', text)]


def render(token):
    unsub = f'{ORIGIN}/unsubscribe?token={urllib.parse.quote(token)}'
    paras = paragraphs()
    body = ''.join(
        '<p style="margin:0 0 16px">' + '<br>'.join(html.escape(l) for l in p.split('\n')) + '</p>'
        for p in paras)
    page = (
        '<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff">'
        '<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'
        "'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#111111\">"
        f'{body}'
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px">'
        '<p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280">'
        "You’re receiving this because you have a Pool Rental Near Me account. "
        f'<a href="{html.escape(unsub)}" style="color:#6b7280">Unsubscribe</a>.<br>'
        f'{html.escape(POSTAL)}</p></div></body></html>')
    text = ('\n\n'.join(paras) + '\n\n--\n'
            "You’re receiving this because you have a Pool Rental Near Me account.\n"
            f'Unsubscribe: {unsub}\n{POSTAL}\n')
    return page, text, unsub


# ---------------------------------------------------------------- services (WEST)
def west_env():
    env = dict(l.split('=', 1) for l in subprocess.run(
        ['docker', 'inspect', 'poolrentalnearme-production', '--format', '{{range .Config.Env}}{{println .}}{{end}}'],
        capture_output=True, text=True).stdout.splitlines() if '=' in l)
    for l in open('/home/ubuntu/nginx-smoke.env'):
        if l.startswith('EMAILIT_API_KEY='):
            env['EMAILIT_API_KEY'] = l.strip().split('=', 1)[1]
    return env


class SB:
    def __init__(self, env):
        self.u, self.k = env['SUPABASE_URL'].rstrip('/'), env['SUPABASE_SERVICE_ROLE_KEY']

    def req(self, method, path, body=None, prefer=None):
        h = {'apikey': self.k, 'Authorization': 'Bearer ' + self.k, 'Content-Type': 'application/json',
             'Range': '0-9999'}
        if prefer:
            h['Prefer'] = prefer
        r = urllib.request.Request(f'{self.u}/rest/v1/{path}', method=method, headers=h,
                                   data=json.dumps(body).encode() if body is not None else None)
        with urllib.request.urlopen(r, timeout=30) as resp:
            t = resp.read()
            return json.loads(t) if t else None

    def suppressed(self):
        out = set()
        for r in self.req('GET', 'suppressed_emails?select=email'):
            out.add((r.get('email') or '').strip().lower())
        for r in self.req('GET', 'email_unsubscribe_tokens?select=email&used_at=not.is.null'):
            out.add((r.get('email') or '').strip().lower())
        for r in self.req('GET', 'host_subscribers?select=email,status,unsubscribed_at'):
            if r.get('unsubscribed_at') or str(r.get('status') or '').lower() in ('unsubscribed', 'excluded', 'paused'):
                out.add((r.get('email') or '').strip().lower())
        out.discard('')
        return out

    def token_for(self, email, create):
        q = urllib.parse.quote(email)
        rows = self.req('GET', f'email_unsubscribe_tokens?select=token,used_at&email=eq.{q}')
        if rows:
            return None if rows[0].get('used_at') else rows[0]['token']
        if not create:
            return 'DRY-RUN-TOKEN'
        self.req('POST', 'email_unsubscribe_tokens?on_conflict=email',
                 {'token': secrets.token_hex(32), 'email': email}, prefer='resolution=ignore-duplicates')
        rows = self.req('GET', f'email_unsubscribe_tokens?select=token,used_at&email=eq.{q}')
        return rows[0]['token'] if rows and not rows[0].get('used_at') else None

    def log_send(self, email, msg_id, status, err=None):
        try:
            self.req('POST', 'email_send_log', {'recipient_email': email, 'template_name': CAMPAIGN,
                                                'status': status, 'message_id': msg_id or None,
                                                'error_message': err, 'metadata': {'campaign': CAMPAIGN}},
                     prefer='return=minimal')
        except Exception:
            pass  # the local jsonl log is authoritative for resume


def emailit_send(key, to, page, text, unsub_api):
    body = {'from': FROM, 'to': to, 'reply_to': REPLY_TO, 'subject': SUBJECT, 'html': page, 'text': text,
            'headers': {'List-Unsubscribe': f'<{unsub_api}>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'}}
    for attempt in range(6):
        r = urllib.request.Request(EMAILIT, data=json.dumps(body).encode(), method='POST',
                                   headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
                                            'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(r, timeout=30) as resp:
                d = json.loads(resp.read() or b'{}')
                return d.get('id', ''), None, dict(resp.headers)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(float(e.headers.get('Retry-After') or 2) + attempt)
                continue
            return None, f'{e.code} {e.read()[:200].decode("utf-8", "replace")}', {}
    return None, '429 retries exhausted', {}


def emailit_status(key, msg_id):
    r = urllib.request.Request(f'{EMAILIT}/{urllib.parse.quote(msg_id)}',
                               headers={'Authorization': 'Bearer ' + key, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            d = json.loads(resp.read() or b'{}')
            d = d.get('data', d)
            return str(d.get('status') or 'unknown').lower()
    except urllib.error.HTTPError as e:
        return f'http{e.code}'


# ---------------------------------------------------------------- recipients
def recipients(suppressed):
    aud = json.load(open(AUDIENCE))
    out, seen, dropped = [], set(), {'unverified (later phase)': 0, 'junk domain': 0, 'suppressed (live)': 0, 'duplicate': 0}
    for seg in SEGMENT_ORDER:
        for uid, email, verified, created in sorted(aud.get(seg, []), key=lambda r: r[3] or ''):
            e = email.strip().lower()
            if not verified:
                dropped['unverified (later phase)'] += 1
            elif JUNK.search(e):
                dropped['junk domain'] += 1
            elif e in suppressed:
                dropped['suppressed (live)'] += 1
            elif e in seen:
                dropped['duplicate'] += 1
            else:
                seen.add(e)
                out.append((seg, uid, e))
    return out, dropped


def sent_already():
    done = set()
    if os.path.exists(LOG):
        for l in open(LOG):
            r = json.loads(l)
            if r.get('status') == 'sent':
                done.add(r['email'])
    return done


def mask(e):
    u, d = e.split('@', 1)
    return f'{u[:1]}***@{d}'


# ---------------------------------------------------------------- modes
def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'dry'
    if mode == 'render':
        page, text, _ = render('PREVIEW-TOKEN')
        open(os.environ.get('OUT', BASE) + '/preview.html', 'w').write(page)
        open(os.environ.get('OUT', BASE) + '/preview.txt', 'w').write(text)
        print('rendered', len(page), 'bytes html,', len(paragraphs()), 'paragraphs')
        return

    env = west_env()
    sb = SB(env)
    key = env['EMAILIT_API_KEY']

    if mode == 'test':
        tok = sb.token_for(TEST_TO, create=True)
        page, text, _ = render(tok)
        mid, err, hdr = emailit_send(key, TEST_TO, page, text, f'{ORIGIN}/email/unsubscribe?token={tok}')
        print('test send ->', 'id ' + mid[:10] if mid else 'ERROR ' + str(err))
        print('daily limit remaining:', hdr.get('ratelimit-daily-remaining'), '/', hdr.get('ratelimit-daily-limit'),
              '| per-second limit:', hdr.get('ratelimit-limit'))
        if mid:
            sb.log_send(TEST_TO, mid, 'sent')
            time.sleep(90)
            print('status after 90s:', emailit_status(key, mid))
        return

    sup = sb.suppressed()
    rcpts, dropped = recipients(sup)
    done = sent_already()
    todo = [r for r in rcpts if r[2] not in done]
    by = {}
    for seg, _, _ in todo:
        by[seg] = by.get(seg, 0) + 1
    print('suppression set (live):', len(sup))
    print('dropped:', dropped)
    print('already sent (log):', len(done))
    print('this run would send:', len(todo), '| by segment, in order:')
    for seg in SEGMENT_ORDER:
        print(f'   {seg}: {by.get(seg, 0)}')
    if todo:
        print('first:', mask(todo[0][2]), todo[0][0], '| last:', mask(todo[-1][2]), todo[-1][0])
        print(f'estimated duration: ~{len(todo) * PACE_S / 60:.0f} min plus bounce checks')
    if mode == 'dry':
        print('DRY RUN: nothing sent, nothing written.')
        return

    if mode != 'send':
        raise SystemExit('unknown mode')
    if os.environ.get('CONFIRM') != f'GO-{len(todo)}':
        raise SystemExit(f'refusing: set CONFIRM=GO-{len(todo)} to send exactly {len(todo)}')

    sent_ids = []  # (ts, id)
    checked = {}
    n_sent = n_fail = n_skip = 0
    for i, (seg, uid, email) in enumerate(todo, 1):
        if os.path.exists(STOP):
            print('STOP file present: halting at', i - 1)
            break
        if i % 100 == 1 and i > 1:
            sup = sb.suppressed()
            # bounce guard: statuses of messages at least 3 minutes old
            ripe = [m for t, m in sent_ids if time.time() - t >= 180 and m not in checked]
            for m in ripe:
                checked[m] = emailit_status(key, m)
                time.sleep(0.2)
            bad = sum(1 for s in checked.values() if s in ('bounced', 'failed', 'errored'))
            print(f'[{i - 1}] sent={n_sent} failed={n_fail} skipped={n_skip} | checked {len(checked)}: '
                  f'bounced/failed {bad}', flush=True)
            if len(checked) >= 40 and bad / len(checked) > BOUNCE_STOP:
                print(f'BOUNCE GUARD: {bad}/{len(checked)} > {BOUNCE_STOP:.0%} - halting', flush=True)
                break
        if email in sup:
            n_skip += 1
            continue
        tok = sb.token_for(email, create=True)
        if not tok:
            n_skip += 1
            continue
        page, text, _ = render(tok)
        mid, err, _ = emailit_send(key, email, page, text, f'{ORIGIN}/email/unsubscribe?token={tok}')
        rec = {'ts': time.time(), 'email': email, 'uid': uid, 'segment': seg,
               'id': mid, 'status': 'sent' if mid else 'failed', 'error': err}
        with open(LOG, 'a') as f:
            f.write(json.dumps(rec) + '\n')
        sb.log_send(email, mid, rec['status'], err)
        if mid:
            n_sent += 1
            sent_ids.append((time.time(), mid))
        else:
            n_fail += 1
        time.sleep(PACE_S)
    # final bounce snapshot for everything sent in this run
    time.sleep(180)
    for t, m in sent_ids:
        if m not in checked:
            checked[m] = emailit_status(key, m)
            time.sleep(0.2)
    tally = {}
    for s in checked.values():
        tally[s] = tally.get(s, 0) + 1
    print(f'DONE sent={n_sent} failed={n_fail} skipped={n_skip} | Emailit statuses: {tally}', flush=True)


if __name__ == '__main__':
    main()
