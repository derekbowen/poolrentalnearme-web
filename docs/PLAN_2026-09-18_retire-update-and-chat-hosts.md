# Retirement investigation — `update.poolrentalnearme.com` and `chat.13.56.113.85.nip.io`

**2026-09-18. READ-ONLY. Nothing was changed.** No nginx edit, no certbot call, no
DNS change, no container restart, no Cloudflare change. Every finding below is a
measurement, not a projection.

**Verdict:** both hostnames are dead weight and both are safe to delete. But the
removal of the `nip.io` vhost is **not** a simple delete — it is currently
nginx's default server for port 443, and removing it without a replacement
makes WEST *easier* to fingerprint, not harder. See §7.

A separate **P0 security finding** came out of this investigation and is
independent of the retirement decision. See §10.

---

## 1. Legitimate dependencies on `update.poolrentalnearme.com`

**None found.** Every surface Derek asked for was checked.

| surface | method | result |
|---|---|---|
| nginx config | `grep -rn 'server_name.*update' /etc/nginx/` | 2 server blocks, `sites-enabled/default` lines **645–646**. Nothing else. All other hits are dated backups |
| application source (WEST) | grep of `/home/ubuntu` excl. `node_modules` | **zero**, outside nginx backup files |
| application source (EAST) | grep of `/home/ubuntu` excl. `node_modules` | **zero** |
| application source (repo) | grep of `*.ts/tsx/js/jsx/sql/json/yml/sh/py` | **zero** |
| container env | `docker exec poolrentalnearme-production env` | **zero** references to the hostname |
| EAST `.env` + `pm2 env 0` | grep | **zero** |
| cron (ubuntu + root + `/etc/cron.d`) | grep, both boxes | **zero** |
| systemd units and timers | grep, both boxes | **zero** |
| pm2 process list / dump | inspected | **zero** |
| Supabase `Prnm-content-production` | scanned **every table in `public`** via `to_jsonb(t)::text ilike` | **zero rows** in any table |
| deployment scripts | `ship_big.py`, `deploy-east.sh`, build tree | **zero** |
| monitoring / watchdogs | grep for the hostname | **zero** |
| webhooks | no inbound webhook config names it | **zero** |

**What it actually is:** a reverse proxy to a third-party domain.

```nginx
# /etc/nginx/sites-enabled/default:645
server { server_name update.poolrentalnearme.com;
  location / { set $intercom "https://intercom.news";
               proxy_set_header Host $host; proxy_pass $intercom; }
  listen 443 ssl;
  ssl_certificate     /etc/letsencrypt/live/update.poolrentalnearme.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/update.poolrentalnearme.com/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf; ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; }

# /etc/nginx/sites-enabled/default:646
server { if ($host = update.poolrentalnearme.com) { return 301 https://$host$request_uri; }
  listen 80; server_name update.poolrentalnearme.com; return 404; }
```

Derek has confirmed **we do not use intercom.news**. The upstream itself is
currently serving 404 at its own root, so the vhost returns `404 Not found` to
every request. Historically it returned 502 as well.

> Note: `VITE_INTERCOM_APP_ID=nuuc4281` **is** present in the marketplace
> container env. That is **Intercom the support-chat product**, a different and
> unrelated thing from `intercom.news`. It is also inert: grepping the built
> marketplace bundle for `intercom` / `widget.intercom.io` returns **nothing**,
> so no widget loads. It is not a dependency on `update.*` either way.

## 2. Legitimate dependencies on `chat.13.56.113.85.nip.io`

**None found, but the service behind it is real and running.**

| surface | result |
|---|---|
| nginx (WEST) | `/etc/nginx/conf.d/chat-proxy.conf` — 443 vhost with its own cert, proxies to `http://3.222.110.146:80` |
| nginx (EAST) | `/etc/nginx/sites-enabled/chatwoot.conf` — port 80, `server_name chat.13.56.113.85.nip.io`, proxies to `127.0.0.1:3009` |
| the service | Chatwoot: `chatwoot-rails-1`, `-sidekiq-1`, `-redis-1`, `-postgres-1`, all up ~6 weeks |
| Chatwoot config | `FRONTEND_URL=https://chat.13.56.113.85.nip.io`, `ENABLE_ACCOUNT_SIGNUP=true` |
| **Chatwoot contents** | **`users=0 accounts=0 inboxes=0 conversations=0`** |
| marketplace app | zero references to Chatwoot in the build tree or bundle |
| fresh-web (EAST) | zero references |
| repo source | zero references |
| container env / `.env` / `pm2 env` | `CONCIERGE_INBOUND_URL` and `LEGACY_INBOUND_URL` are **not set anywhere** in production. They exist only as optional, unset keys in `.env.example` and two docs |
| cron / systemd / timers | zero, both boxes |
| Supabase | zero rows, all tables |
| mobile app repo | no Chatwoot SDK |

**The database is empty.** Chatwoot was deployed, never configured, and has
never held a single conversation. There is no data to migrate and nothing to
preserve.

## 3. Traffic classification

Separating scanners from application traffic was the point of the exercise, and
the answer is unambiguous: **there is no application traffic to either host.**

### `update.poolrentalnearme.com` — 524 requests / 14 days

| status | count | what |
|---|---|---|
| 404 | 467 | WordPress/CMS probes |
| 502 | 42 | upstream down at the time |
| 403 | 5 | |
| 301 | 3 | http→https redirect |
| 499 | 2 | client hung up |
| **200** | **5** | **all five are `/favicon.ico`** |

Top user-agents: a spoofed `Chrome/120` string (**117**), `WordPress/6.4.3` (**20**),
one Cloudflare security-center scan, one bare `Mozilla/5.0`.

Four IPs account for 447 of 524 requests:
`45.148.10.123` ×142, `45.148.10.60` ×136, `45.148.10.246` ×97, `93.123.109.178` ×72.

Representative paths: `/wp-json/batch/v1` and variants, `xmlrpc.php`,
`/update.poolrentalnearme.com_db.sql` — i.e. someone hunting for an exposed
database dump.

**Classification: 100% scanner. Zero application requests. Zero human sessions.
The only 200s are favicon fetches.**

### `chat.13.56.113.85.nip.io` — 104 requests / 14 days on WEST

Recent window, by user-agent: `Scrapy/2.17.0`, `RootEvidence/1.0`,
`InternetMeasurement/1.0`, and one `MicroMessenger` (WeChat webview) string.
EAST saw 2 of these reach Chatwoot, both `GET /installation/onboarding`, both 200.

**Classification: 100% scanner. Zero application requests.** The two 200s are
scanners landing on the unconfigured setup page — see §10.

## 4. Exact nginx files involved

| file | box | lines | action |
|---|---|---|---|
| `/etc/nginx/sites-enabled/default` | WEST | **645, 646** | delete both server blocks |
| `/etc/nginx/conf.d/chat-proxy.conf` | WEST | whole file | delete, **but see §7 first** |
| `/etc/nginx/sites-enabled/chatwoot.conf` | EAST | whole file | delete |

Not to be touched, listed only so they are not confused with the above:
`/etc/nginx/default.bak.20260618`, `/etc/nginx/config-backups/default.bak-*` (7 files),
`/home/ubuntu/nginx-*.bak*` (~15 files) and `/home/ubuntu/nginx-backups/*` (~25 files)
all contain the same `update.*` block. They are inert historical copies. Leave
them; they are the rollback material.

## 5. Exact certificates involved

| certificate name | expiry | renewal conf | authenticator | shared with anything? |
|---|---|---|---|---|
| `update.poolrentalnearme.com` | **2026-12-05** (77 days) | `/etc/letsencrypt/renewal/update.poolrentalnearme.com.conf` | `nginx` (HTTP-01) | no — single-domain |
| `chat.13.56.113.85.nip.io` | **2026-11-03** (46 days) | `/etc/letsencrypt/renewal/chat.13.56.113.85.nip.io.conf` | `nginx` (HTTP-01) | no — single-domain |

Both are single-domain certs used by exactly one vhost each. Deleting either
affects nothing else. The two certs that **must** survive are
`www.poolrentalnearme.com` (exp. 2026-11-03) and `poolrentalnearme.com`
(exp. 2026-11-26).

Both doomed certs use `authenticator = nginx`, i.e. HTTP-01 on port 80 from
Let's Encrypt's worldwide validators. That is precisely the constraint that the
origin-lockdown plan flagged as forcing port 80 to stay open to the world
(`docs/PLAN_2026-09-18_origin-lockdown.md` §6). **Retiring both removes that
constraint** — which is the single biggest operational win here, bigger than
the disclosure itself.

## 6. Exact DNS records involved

| record | value | zone | proxied | action |
|---|---|---|---|---|
| `update.poolrentalnearme.com` **A** | `13.56.113.85`, TTL 14400 | Cloudflare `poolrentalnearme.com` (`f153ae5162eb55f788ee0956ef0f3d7a`) | **no — DNS only** | **delete** |
| `chat.13.56.113.85.nip.io` | n/a | **not our zone** — `nip.io` is a public wildcard service (`ns-00.nip.io`) that decodes the IP from the label | n/a | **nothing to delete; it stops resolving to anything useful the moment the vhost goes** |

Confirmed authoritative against `max.ns.cloudflare.com`. No CNAME exists for
either name. `chat.poolrentalnearme.com` does not exist.

**Adjacent records found while checking, for information only — not part of this change:**

| name | value | note |
|---|---|---|
| `test.poolrentalnearme.com` | `13.56.89.89` | **a different unproxied origin**, own LE cert `CN=test.poolrentalnearme.com` exp. 2026-11-05, HTTPS returns **401**. Not WEST. Ownership unconfirmed. Worth a separate decision |
| `go.poolrentalnearme.com` | `links.switchy.io` | in use — Switchy short links |
| `help.poolrentalnearme.com` | `toruhicu-wowesani.eniston.com` | third-party knowledge base |

## 7. ⚠️ The one thing that makes this non-trivial

`/etc/nginx/conf.d/*.conf` is included **before** `/etc/nginx/sites-enabled/*`
(nginx.conf lines 63–64). The first `listen 443 ssl` in the resulting config is
`chat-proxy.conf` line 215.

**That makes the Chatwoot vhost nginx's default server for port 443 on WEST.**

Measured, not assumed:

```
openssl s_client -connect 13.56.113.85:443 -servername 13.56.113.85   → CN = chat.13.56.113.85.nip.io
openssl s_client -connect 13.56.113.85:443 -servername nosuchhost.example → CN = chat.13.56.113.85.nip.io
curl -k --resolve nosuchhost.example:443:13.56.113.85 https://nosuchhost.example/ → 200
```

So **any** TLS connection to 13.56.113.85 with an SNI that matches nothing gets
the nip.io certificate and is proxied to EAST's Chatwoot. (This also corrects a
line in the earlier origin-lockdown audit which recorded IP-as-SNI as "connection
fails" — the connection succeeds; what failed there was certificate *validation*.)

If `chat-proxy.conf` is simply deleted, the next block in order becomes the
:443 default — that is the **main `www.poolrentalnearme.com` marketplace block**
(`sites-enabled/default`, `listen` at lines 927–928, `server_name` at line 314).
Unmatched-SNI connections would then be served the **valid www certificate and
the live production site**. For anyone scanning the IPv4 space looking for the
origin behind Cloudflare, that is a *better* signal than a stray Chatwoot login.

**Therefore the removal must add an explicit rejecting default server for :443
in the same change.** Port 80 already behaves correctly (`return 404` on
unmatched Host, measured), because `chat-proxy.conf` line 229 is also the :80
default and already 404s — so the :80 default must be preserved too when that
file goes.

## 8. Safe removal order

Nothing below has been executed. Each step is individually reversible and the
order is chosen so that no step can leave a window where production is exposed
or unreachable.

**Phase 0 — capture rollback material (no change)**
1. `cp /etc/nginx/sites-enabled/default /home/ubuntu/nginx-backups/default.bak.pre-retire-20260918`
2. `cp /etc/nginx/conf.d/chat-proxy.conf /home/ubuntu/nginx-backups/chat-proxy.conf.bak.pre-retire-20260918`
3. On EAST: `cp /etc/nginx/sites-enabled/chatwoot.conf /home/ubuntu/chatwoot.conf.bak.pre-retire-20260918`
4. `tar` the two `/etc/letsencrypt/{live,archive,renewal}` trees for the two doomed certs to `/home/ubuntu/le-backup-retire-20260918.tar.gz`, mode 600. **This is what makes cert deletion reversible without re-issuing.**
5. Screenshot / record the Cloudflare `update` A record exactly (name, type, value, TTL, proxy status) before deleting it.

**Phase 1 — WEST nginx, one reload (the only step with any blast radius)**

Do all three edits, then one `nginx -t`, then one `reload`:

6. Add an explicit rejecting default server, placed so it is first in include
   order (a new `/etc/nginx/conf.d/00-default-server.conf`, which sorts before
   `chat-proxy.conf` and before `sites-enabled/`):
   - `listen 80 default_server; server_name _; return 404;`
   - `listen 443 ssl default_server; server_name _; ssl_reject_handshake on;`
     (nginx ≥1.19.4 — **verify the installed version first**; if older, use a
     self-signed throwaway cert and `return 444` instead)
7. Delete `/etc/nginx/conf.d/chat-proxy.conf`.
8. Delete lines 645–646 of `/etc/nginx/sites-enabled/default` (exact-anchor edit,
   matching the full single-line server blocks quoted in §1).
9. `nginx -t` → must pass. `systemctl reload nginx`.
10. **Verify immediately**, in this order:
    - `https://www.poolrentalnearme.com/s` still 200 and still serves the current
      `assets/index-<hash>.js` marker (proves the marketplace block is intact)
    - `https://www.poolrentalnearme.com/` still 200 (proves the EAST proxy path)
    - `https://poolrentalnearme.com/` still 301 → www
    - bogus-SNI to the IP now fails the handshake (or 444s)
    - `https://update.poolrentalnearme.com/` now fails TLS
    - `https://chat.13.56.113.85.nip.io/` now fails TLS
    - `curl -H 'Host: nosuchhost.example' http://13.56.113.85/` still 404
    - `/tools/cta.js` still 200 (proves `/var/www/prnm-tools` unaffected)

    **If any marketplace check fails, stop and roll back (§9) before doing
    anything else.** Do not proceed to Phase 2 on a partial failure.

**Phase 2 — EAST nginx**
11. Delete `/etc/nginx/sites-enabled/chatwoot.conf`, `nginx -t`, reload.
12. Verify `https://www.poolrentalnearme.com/` and a `/p/*` pSEO page still 200
    (EAST serves both through WEST).
13. Leave the Chatwoot containers running for now — stopping them is a separate,
    later decision and is not needed to close the exposure once the vhosts are
    gone. Removing the vhost already makes port 3009 unreachable from outside.

**Phase 3 — certificates (only after Phases 1–2 verified)**
14. `certbot delete --cert-name update.poolrentalnearme.com`
15. `certbot delete --cert-name chat.13.56.113.85.nip.io`
16. `certbot renew --dry-run` → must show **only** `www.poolrentalnearme.com` and
    `poolrentalnearme.com`, both succeeding. This is the step that proves we have
    not broken renewal for the certs that matter.
17. Confirm `snap.certbot.renew.timer` is still enabled and scheduled.

**Phase 4 — DNS (last, because it is the slowest to undo in practice)**
18. Delete the Cloudflare `update` A record.
19. Confirm `dig update.poolrentalnearme.com @max.ns.cloudflare.com` returns NXDOMAIN.
20. Re-confirm apex and www still resolve to the two Cloudflare anycast IPs
    (`104.21.84.187`, `172.67.195.185`) and the site still loads.

**Phase 5 — record**
21. Mirror the nginx edits into this repo (the `/home/ubuntu/build` drift rule)
    and push, plus an ops record noting what was deleted and where the backups are.

**Why this order:** nginx first (instantly reversible, and it is the step that
actually closes the exposure), certs second (harmless once nothing references
them, and deleting them while a vhost still points at the path would break
`nginx -t`), DNS last (deleting it first would break HTTP-01 and strand the cert
in a half-state). Adding the default-server block *before* removing `chat-proxy.conf`
in the same reload means there is never a moment where the marketplace block is
the :443 default.

## 9. Rollback procedure

| step | undo |
|---|---|
| Phase 1 nginx | `cp /home/ubuntu/nginx-backups/default.bak.pre-retire-20260918 /etc/nginx/sites-enabled/default`, `cp /home/ubuntu/nginx-backups/chat-proxy.conf.bak.pre-retire-20260918 /etc/nginx/conf.d/chat-proxy.conf`, `rm /etc/nginx/conf.d/00-default-server.conf`, `nginx -t`, `reload`. **Seconds, no downtime window** — same mechanic as the documented `main-web.conf` swap |
| Phase 2 nginx (EAST) | restore `chatwoot.conf` from the backup, `nginx -t`, reload |
| Phase 3 certs | untar `/home/ubuntu/le-backup-retire-20260918.tar.gz` back over `/etc/letsencrypt/{live,archive,renewal}`. If the tar is lost, re-issue with `certbot --nginx -d <name>` — but that needs the DNS record back first, so **do Phase 4 rollback before Phase 3 rollback** |
| Phase 4 DNS | re-create the A record: `update` → `13.56.113.85`, TTL 14400 (or Auto), **DNS-only, not proxied**. Propagation is bounded by the 14400s TTL for resolvers that cached it |

**Full rollback to today's exact state is possible at every phase.** The only
irreversible-ish element is Let's Encrypt rate limits if certs were deleted,
re-issued, deleted and re-issued repeatedly — not a concern for a single undo.

## 10. P0 finding, independent of the retirement decision

**An unconfigured Chatwoot superadmin setup page is publicly reachable and
scanners have already found it.**

```
GET https://chat.13.56.113.85.nip.io/installation/onboarding  → 200
<title>SuperAdmin | Chatwoot</title>
form fields: user[company], user[email], user[name], user[password]   (5,189 bytes)
```

- The Chatwoot database is empty: `users=0 accounts=0 inboxes=0 conversations=0`.
- `ENABLE_ACCOUNT_SIGNUP=true`.
- Because that vhost is the **:443 default server** (§7), the page is reachable at
  the raw IP and at *any* hostname pointed at 13.56.113.85 — not only the nip.io name.
- Two external scanners have fetched exactly that path in the last 14 days
  (`InternetMeasurement/1.0`, and a `MicroMessenger` UA).

Anyone who submits that form becomes superadmin of a Chatwoot instance running on
our EAST box. It holds no customer data today, so the immediate loss would be the
instance itself rather than any host or guest record — but it is a live foothold
on infrastructure that also runs the public marketing site, and it is one form
submission away from being someone else's.

**Retiring the vhosts closes this.** If for any reason the retirement is deferred,
this should be closed on its own, immediately, by stopping the Chatwoot containers
or removing the EAST vhost — either is a one-line change.

## 11. Does removing both eliminate all known WEST origin-IP disclosures?

**No.** It removes both *active* ones, which is worth doing, but the IP is
already permanently public through channels that no configuration change can
retract.

**Closed by this change:**

1. `update.poolrentalnearme.com` A → `13.56.113.85`, published unproxied in our own DNS.
2. `chat.13.56.113.85.nip.io` — the IP is literally *in the hostname*.

**Not closed, and not closable:**

3. **Certificate Transparency.** `chat.13.56.113.85.nip.io` was issued by Let's
   Encrypt and is permanently logged in public CT. Anyone running a CT search for
   `poolrentalnearme` or for `13.56.113.85` finds it forever. Deleting the cert
   locally does not remove the log entry. Same for the `update.*` cert, which ties
   the name to us though not the IP.
4. **Historical passive DNS.** `www.poolrentalnearme.com` resolved to
   `13.56.113.85` until 2026-09-16. SecurityTrails, DNSDumpster, ViewDNS et al.
   keep that permanently.
5. **Internet-wide scanning.** `https://13.56.113.85` with SNI `www.poolrentalnearme.com`
   returns the live site with a valid certificate. Censys/Shodan-class scanners
   index origins by exactly this. The §8 default-server block makes blind SNI
   scanning less productive but does not hide the host from anyone who already
   has the pairing.
6. **`test.poolrentalnearme.com` → `13.56.89.89`** is a separate unproxied origin
   with its own public certificate. It does not disclose *WEST's* IP, but it is
   the same class of exposure and is still open.

**Conclusion:** the AWS security group remains the only control that actually
matters. Retiring these two hostnames is still worth doing — not because it hides
the IP, but because it (a) removes the HTTP-01 requirement that is currently
forcing port 80 open to the entire internet, which is a hard blocker in the
origin-lockdown plan, (b) deletes a proxy to a third party we do not use, and
(c) closes the §10 foothold. Treat it as reducing attack *surface*, not as
concealment.

## 12. Unrelated state note

Unchanged and untouched by this investigation: the three GO 4 host lifecycle
cohorts remain unsent. Engine config still `HOST_PRODUCTION_CAMPAIGNS=no_listing_1`,
daily cap 25, no cohort fence, **no cron installed**.
