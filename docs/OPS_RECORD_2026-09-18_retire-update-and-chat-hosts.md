# Ops record — 2026-09-18 — retirement of `update.poolrentalnearme.com` and `chat.13.56.113.85.nip.io`

Executed 2026-09-18 02:32–02:56 UTC. Plan: `docs/PLAN_2026-09-18_retire-update-and-chat-hosts.md`.

**Outcome: complete and verified. The marketplace never went down, nginx was
never restarted (reload only), and no rollback was required in the final run.**

WEST nginx master PID **1474885** before, during and after every step, uptime
`2-20:53:02` at final proof — proof that only reloads happened.

---

## 1. Files changed

| box | file | change | backup |
|---|---|---|---|
| WEST | `/etc/nginx/conf.d/00-default-server.conf` | **created** (explicit rejecting default server, :80 + :443, IPv4 + IPv6) | n/a — remove to undo |
| WEST | `/etc/nginx/conf.d/chat-proxy.conf` | **deleted** | `/home/ubuntu/retire-20260918/chat-proxy.conf.bak` |
| WEST | `/etc/nginx/sites-enabled/default` | **lines 645–646 removed** (646 → 644 lines); the two `update.*` server blocks. Nothing else in the file touched | `/home/ubuntu/retire-20260918/default.bak` |
| WEST | `/etc/nginx/reject-default/reject.{crt,key}` | **created** — self-signed `CN=invalid.invalid`, 3650d. Needed because nginx is **1.18.0**, which predates `ssl_reject_handshake` | n/a |
| EAST | `/etc/nginx/sites-enabled/chatwoot.conf` | **deleted** | `/home/ubuntu/retire-20260918/chatwoot.conf.bak` |
| WEST | certbot lineage `update.poolrentalnearme.com` | **deleted** | in `le-backup-retire-20260918.tar.gz` |
| WEST | certbot lineage `chat.13.56.113.85.nip.io` | **deleted** | in `le-backup-retire-20260918.tar.gz` |
| Cloudflare | `update` A → 13.56.113.85 (DNS-only, TTL 14400) | **deleted** | `cf-update-record-deleted.json` |

**md5, before → after:** `sites-enabled/default` `776db716…` → `7f2fecc4…`;
`00-default-server.conf` `c417b4f6…`.

### Backup paths (all on WEST, `/home/ubuntu/retire-20260918/`)

```
default.bak                       30941  (md5 776db7168a8bf60213e61a0a4332b000)
chat-proxy.conf.bak                1091  (md5 2710c00e31b16b396a208b993f72d5b8)
chatwoot.conf.bak                   479  (md5 2947e8af5652eacf0a910416eda13ec2)  [on EAST]
le-backup-retire-20260918.tar.gz  12737  (md5 c4701de896cee74a4f3c03713bc918c6, 44 entries, mode 600)
nginx-T.before.txt               149732  (md5 526ab0cbb2c271f6d3185d344c3562a5)
nginx-T.staged.txt               148992
cf-records-before.json            25114  (61 records)
cf-records-after.json             24762  (60 records)
cf-update-record-deleted.json       335
```

### Config diff — the one net addition

```nginx
# /etc/nginx/conf.d/00-default-server.conf
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    access_log off;
    return 404;
}
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_certificate     /etc/nginx/reject-default/reject.crt;
    ssl_certificate_key /etc/nginx/reject-default/reject.key;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    access_log off;
    return 444;
}
```

Both IPv4 **and** IPv6 listeners are declared. Without the `[::]` lines the IPv6
default would have fallen through to the marketplace block, which declares
`listen [::]:443 ssl` at `sites-enabled/default:942`.

The marketplace server blocks were **not** modified. The only reason this file
exists is the default-vhost fix; no cleanup, reformatting, cert consolidation or
unrelated security work was performed.

## 2. Baseline (captured 02:32 UTC, before any change)

| item | value |
|---|---|
| nginx | 1.18.0 (Ubuntu); master PID 1474885 |
| sockets | 0.0.0.0:80, 0.0.0.0:443, [::]:80, [::]:443 (nginx); 127.0.0.1:3000, 127.0.0.1:4000 (app) |
| `upstream web` | `127.0.0.1:4000` |
| `/` | 200, 104,545 B, title "Pool Rental Near Me — Rent a Pool by the Hour…" |
| `/s` | 200, 309,356 B, markers `assets/index--H_ehSN3.js`, `assets/index-iYuSPkm5.js` |
| `/login` | 200, 81,137 B |
| apex | 301 |
| `/p/rent-out-your-pool` | 200, 85,000 B |
| `POST /api/transaction-line-items` | **400** (app reached, validating) — chosen as the live API probe |
| `/tools/cta.js` | 200, 15,236 B |
| www TLS | `CN=www.poolrentalnearme.com`, LE `YE1`, notAfter Nov 3 2026, SHA256 `D9:B8:76:93:…:70:30` |
| **unknown SNI** | **200, 104,368 B — the EAST homepage** (chat-proxy was the :443 default and forwarded `$host` to EAST's catch-all) |
| raw-IP Host :80 | 404 |
| `update.*` https | 404 · `chat…nip.io` https 302 · chat onboarding **200** |
| WEST→EAST | `/` 200 |
| nginx errors, last 200 lines | **0** |
| status mix, last 2000 | 1360×200, 289×204, 146×404, 86×301, 42×302, 30×400, 29×304, 11×307 — **no 5xx** |

Rendered config saved to `nginx-T.before.txt` before anything was touched.

## 3. Reload timestamps

| box | reload (UTC) | master PID before → after | result |
|---|---|---|---|
| WEST | **2026-09-18T02:39:08Z** | 1474885 → 1474885 | clean, rc 0 |
| EAST | **2026-09-18T02:41:00Z** | 1833842 → 1833842 | clean, rc 0 |

One reload per box. `systemctl restart nginx` was never run. `nginx -t` was run
and passed before every reload, including both rollbacks.

## 4. Verification results

### WEST, immediately after reload — all PASS

Rendered-config gate (evaluated on `nginx -T` **before** the reload):
no `nip.io` anywhere · `update` vhost gone · `update` cert reference gone ·
`intercom.news` gone · www block present · marketplace `proxy_pass http://web;`
count still **7** · `upstream web → 127.0.0.1:4000` · `default_server` count **4** ·
reject cert referenced once.

Post-reload: `/s` 200 · `/s` bundle marker present · homepage 200 · `/login` 200 ·
apex 301 · pSEO 200 · live API POST → 400 · `/tools/cta.js` 200 ·
**www TLS fingerprint identical to baseline**.

### EAST, after reload — all PASS

chatwoot vhost gone · no proxy to `:3009` · `fresh-web` `default_server` intact ·
`:3000` proxy count unchanged · ccTLD blocks intact · homepage 200 · pSEO 200 ·
sitemap 200 · homepage title intact · `.co.uk` still served.

`fresh-web` carries an explicit `listen 80 default_server;`, so EAST's default
vhost never depended on `chatwoot.conf` and could not shift. Verified before the
change, not assumed.

### Final production proof (02:56 UTC)

| check | result |
|---|---|
| `/`, `/s`, `/login`, `/p/rent-out-your-pool`, `/tools/cta.js` | 200 |
| apex | 301 |
| `/s` bundle marker | `assets/index--H_ehSN3.js` (matches baseline) |
| homepage title | unchanged |
| `POST /api/transaction-line-items` | 400 (app reached) |
| www TLS | fingerprint `D9:B8:76:…:70:30` — **unchanged** |
| `nginx -t` | successful |
| master PID | 1474885, uptime `2-20:53:02` — never restarted |
| WEST→EAST `/`, `/p/*`, `/sitemap.xml` | 200 |
| **unmatched SNI** | cert `CN=invalid.invalid`, HTTP **000**, **0 body bytes** |
| **raw-IP / unknown Host :80** | 404, 162 B error page (no marketplace content) |
| `update.*` DNS | **NXDOMAIN** on both Cloudflare NS and on 1.1.1.1 / 8.8.8.8 |
| `update.*` https | 000 |
| chat onboarding via nip.io | 000 |
| chat onboarding via WEST IP + Host header | 000 |
| chat onboarding direct to EAST:80 + Host header | 404 |
| certificates remaining | `poolrentalnearme.com` (Nov 26), `www.poolrentalnearme.com` (Nov 3) |
| `certbot renew --dry-run` | **"Congratulations, all simulated renewals succeeded"** for exactly those two, "no renewal failures" |
| renewal timer | `snap.certbot.renew.timer` enabled and scheduled |
| 5xx, last 2000 requests | **0** |
| status mix, last 3000 | 1997×200, 496×204, 194×404, 123×301, 62×302, 51×304, 49×400, 16×307, 3×202 |

### DNS change, proven non-collateral

61 records before → 60 after. Diff computed over the full zone inventory:
**removed exactly one** (`A|update.poolrentalnearme.com|13.56.113.85|False`),
**added none**. Protected records byte-identical before and after:

```
A   poolrentalnearme.com      -> 13.56.113.85   proxied=True
A   www.poolrentalnearme.com  -> 13.56.113.85   proxied=True
A   test.poolrentalnearme.com -> 13.56.89.89    proxied=False   (untouched, separate investigation)
MX  mx1/mx2.hostinger.com · TXT SPF · TXT google-site-verification
```

No Cloudflare proxy setting, firewall rule, cache rule or security group was
touched.

## 5. Rollback status

**No rollback in effect.** The final state is the intended one.

Two rollbacks fired during the run, both triggered by **my own over-strict
assertions, not by a bad config**, and both fired *before* their reload — so
production was never running the new config at the time:

1. **WEST, first attempt.** `nginx -T` dumps comments, and my new file's comment
   named both retired hostnames, so the "hostname removed" greps matched their
   own comment. Rolled back, comment reworded, assertions retargeted at
   directives (`server_name …`, `live/…`). `nginx -t` had passed and every
   structural assertion had passed.
2. **EAST, first attempt.** I asserted `127.0.0.1:3000` appeared exactly once;
   `intl.conf` also proxies there for the ccTLD blocks, so the true count is
   higher. Changed to "≥1 **and** unchanged from baseline".

Both rollbacks restored cleanly and were verified (`/s` 200, `/` 200,
`cta.js` 200, unknown-SNI back to its baseline 200).

One further self-inflicted delay, no production impact: my first
`certbot renew --dry-run` was killed by my own 400s subprocess timeout because
certbot applies a `--preconfigured-renewal` random delay (457s here). The
certbot process survived as an orphan, completed its dry-run successfully at
02:49:40, and held the certbot lock meanwhile — which is why a second attempt
reported "Another instance of Certbot is already running". The deletions had
already completed before that point, and the dry-run result was read from
`/var/log/letsencrypt/letsencrypt.log`.

### How to undo (if ever needed)

```bash
# WEST nginx (seconds, no downtime window)
cp -a /home/ubuntu/retire-20260918/default.bak          /etc/nginx/sites-enabled/default
cp -a /home/ubuntu/retire-20260918/chat-proxy.conf.bak  /etc/nginx/conf.d/chat-proxy.conf
rm -f /etc/nginx/conf.d/00-default-server.conf
nginx -t && systemctl reload nginx

# EAST nginx
cp -a /home/ubuntu/retire-20260918/chatwoot.conf.bak /etc/nginx/sites-enabled/chatwoot.conf
nginx -t && systemctl reload nginx

# Certificates — restore DNS first, then untar
tar xzf /home/ubuntu/retire-20260918/le-backup-retire-20260918.tar.gz -C /

# DNS — re-create from cf-update-record-deleted.json:
#   A  update  ->  13.56.113.85  TTL 14400  DNS-only (proxied=false)
```

## 6. What this closed

1. **The P0 from the plan.** The unconfigured, publicly reachable Chatwoot
   superadmin setup page (`/installation/onboarding`, empty DB,
   `ENABLE_ACCOUNT_SIGNUP=true`) is no longer reachable from outside by any route
   tested: the nip.io name, the WEST IP with a spoofed Host header, or EAST:80
   with a spoofed Host header. Chatwoot's own port is bound to `127.0.0.1:3009`
   only. **The containers were deliberately left running** — removing exposure and
   destroying the service are different operations, and the second was not
   authorised.
2. **A default-vhost exposure that predated this work.** Unmatched SNI used to
   return the live EAST homepage with 104,368 bytes of real content. It now
   returns a throwaway certificate and zero bytes.
3. **The port-80-open-to-the-world constraint.** Both retired certs used HTTP-01
   (`authenticator = nginx`). With them gone, the origin-lockdown plan
   (`docs/PLAN_2026-09-18_origin-lockdown.md` §6) loses one of its three blockers.
4. **One unproxied publication of the WEST origin IP** (`update` A record), plus
   the nip.io hostname that embedded the IP in its own name.

## 7. What this did NOT close

Unchanged from the plan's §11 — removing both does **not** eliminate WEST
origin-IP disclosure:

- **Certificate Transparency** permanently logs `chat.13.56.113.85.nip.io`.
  Deleting the cert does not retract the CT entry.
- **Historical passive DNS**: `www` resolved to 13.56.113.85 until 2026-09-16.
- **Internet-wide scanning**: `https://13.56.113.85` with SNI
  `www.poolrentalnearme.com` still returns the live site with a valid cert.
- **`test.poolrentalnearme.com` → 13.56.89.89** remains, unproxied, with its own
  LE cert (`CN=test.poolrentalnearme.com`, exp. Nov 5 2026) and a 401. Explicitly
  out of scope and deliberately untouched — **it needs its own decision.**

The AWS security group remains the only real control.

## 8. Note on the single logged error

One `[error]` appeared after the WEST reload, at 02:40:38 (before the EAST
reload): `upstream prematurely closed connection` from EAST for
`/p/giggster-vs-pool-rental-near-me-in-metairie`, client a Facebook crawler over
IPv6. Re-tested three times through the edge and once direct to EAST: **200
every time.** It is EAST's node process dropping one connection, on a path this
change does not touch. Error count before the reload today: 0; after: 1.

## 9. Unrelated state note

Untouched by this operation: the three GO 4 host lifecycle cohorts remain
unsent. Engine config still `HOST_PRODUCTION_CAMPAIGNS=no_listing_1`, daily cap
25, no cohort fence, **no cron installed**.
