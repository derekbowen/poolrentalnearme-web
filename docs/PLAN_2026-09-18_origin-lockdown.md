# Origin lockdown plan — poolrentalnearme.com (READ-ONLY, nothing changed)

Goal: make Cloudflare the only public path to WEST and EAST without breaking
WEST→EAST, admin access, deploys, certificate renewal, monitoring or webhooks.

**Nothing was modified.** No DNS record, no security group, no Cloudflare rule,
no nginx reload, no IP blocked. Every statement below is measured.

## 0. THE BLOCKER YOU NEED TO KNOW FIRST

The automation identity **cannot do this work**:

```
arn:aws:iam::783764596813:user/cody
ec2:DescribeSecurityGroups -> UnauthorizedOperation
```

It can run commands through SSM but can neither read nor modify security
groups. So the current rules could not be captured programmatically, and the
change itself must be made **by Derek in the AWS console**, or the IAM policy
must be widened first. This is good news for safety: I cannot lock us out by
accident. It also means step 1 of implementation is a human in the console.

## 1. CURRENT EXPOSURE MAP (all proven by probe)

| path | result | verdict |
|---|---|---|
| `https://13.56.113.85` + SNI `www.poolrentalnearme.com` | **200, live site** | **full bypass of WEST** |
| `http://13.56.113.85/` with `Host: www.poolrentalnearme.com` | 301 → https | bypass entry point |
| `http://13.56.113.85/` no Host | 404 | default block, harmless |
| `https://13.56.113.85` with IP as SNI | connection fails | no cert for IP |
| `http://3.222.110.146/` no Host | **200, live site** | **full bypass of EAST** |
| `https://3.222.110.146` + SNI `www.poolrentalnearme.co.uk` | 302 | ccTLD bypass |
| `http://3.222.110.146:3000/` | connection refused | already closed by SG |
| `dig update.poolrentalnearme.com` | **13.56.113.85** | **origin IP published in our own DNS** |

**Sobering caveat:** `www.poolrentalnearme.com` resolved to 13.56.113.85 in
public DNS until 2026-09-16. That value is permanently recorded in historical
DNS services. **Hiding the IP is not the control; the security group is.**
Proxying `update.*` is hygiene, not protection.

## 2. ALL REQUIRED LEGITIMATE INBOUND FLOWS

### WEST — i-0a711c88043788b2b, us-west-1, sg-0183b7e0dcf8b5b59 (`launch-wizard-2`), vpc-0436596ddd620545b, private 172.31.12.192

| source | port | purpose | static? | via CF today? | breaks if origin closed? |
|---|---|---|---|---|---|
| Cloudflare edge | 443, 80 | all `.com` public traffic | yes, published ranges | yes | no |
| Let's Encrypt validators | 80 | HTTP-01 for `update.*` and `chat.*.nip.io` | **no, worldwide** | **no** | **YES — see §6** |
| Admin SSH | 22 | operator access | last login 159.196.144.120 | no | yes if 22 closed |
| AWS SSM | none inbound | our deploy/runner path | outbound only | n/a | **no — lockout insurance** |
| UptimeRobot | 443 | monitors `/` 3,689 hits/14d | many IPs | assumed yes | only if it targets the IP |
| Browser API calls | 443 | `/api/initiate-privileged`, `/api/transition-privileged`, `/api/transaction-line-items`, `/csp-report` | n/a | yes | no |

Everything the app listens on beyond 80/443/22 is bound to **127.0.0.1 only**
(3000, 3099, 3100, 3110, 4000 via docker-proxy). No host firewall is active;
ufw inactive, iptables INPUT ACCEPT. **The security group is the only control.**

### EAST — i-060692efd53e6e853, us-east-1, sg-09b527622baf115cf (`launch-wizard-1`), vpc-041c1406487319559, private 172.31.24.81

| source | port | purpose | static? | via CF today? | breaks if origin closed? |
|---|---|---|---|---|---|
| **WEST 13.56.113.85** | **80** | **`/` and `/p/*` and `/fw-assets/*` for the whole .com site** | **yes** | **no, direct** | **YES — must be allowlisted** |
| Cloudflare edge | 80, 443 | the three ccTLDs proxy to EAST | yes | yes | no |
| Let's Encrypt validators | 80 | ccTLD certs | no | **yes, hostnames proxied** | no |
| Admin SSH | 22 | operator access | — | no | yes if 22 closed |
| AWS SSM | none inbound | runner path | outbound only | n/a | no |

Measured inbound on EAST today: **346 requests from 13.56.113.85 (WEST)** and a
scatter of 1–3 hits each from unrelated scanner IPs. WEST is effectively the
only legitimate direct client.

**No evidence of inbound webhooks from Stripe, Sharetribe, Supabase, Emailit,
Twilio or GitHub.** The apparent "Stripe" log hits are browser requests for
`StripePayoutPage.duck-*.js` asset files, not webhooks. Stripe webhooks
terminate at Sharetribe, not at us. Verify before cutover rather than trusting
this.

## 3. WEST → EAST DEPENDENCY (the critical constraint)

```
/etc/nginx/sites-enabled/default:
  upstream east_origin { server 3.222.110.146:80; keepalive 32; }
```

Roughly 30 `proxy_pass` directives target EAST, by **public IP over plain HTTP**.

| question | answer |
|---|---|
| hostname/IP used | `3.222.110.146`, the public IP |
| port | **80**, unencrypted |
| public or private | **public internet** |
| can private/VPC routing be used? | **No, not today.** us-west-1 vs us-east-1, `vpc-0436596ddd620545b` vs `vpc-041c1406487319559`. No peering exists. Cross-region VPC peering or Transit Gateway would be an architecture change |
| would locking EAST to Cloudflare break WEST? | **Yes, immediately and totally.** The homepage and every `/p/*` page would fail |
| should WEST be explicitly allowlisted on EAST? | **Yes. This is mandatory** |

Per your instruction not to redesign architecture, the plan **keeps the public
hop and allowlists WEST's IP**. Worth noting for later, not now: that hop
carries all pSEO HTML unencrypted across the public internet.

## 4. DNS EXPOSURE AUDIT — `poolrentalnearme.com`, 61 records, 2 proxied

| record | value | class | note |
|---|---|---|---|
| `poolrentalnearme.com` A | 13.56.113.85 **proxied** | SAFE — already correct | |
| `www` A | 13.56.113.85 **proxied** | SAFE — already correct | |
| **`update`** A | **13.56.113.85 unproxied** | **SAFE TO PROXY** | see §8 |
| `test` A | 13.56.89.89 | **UNKNOWN** | AWS us-west-1, not a known production box |
| `help-test` A | 54.219.198.117 | **UNKNOWN** | AWS us-west-1 |
| `connect`, `es`, `hostpro`, `memories`, `parcs` A | 185.158.133.1 | MUST REMAIN DNS-ONLY | Hostinger, third-party |
| `ftp`, `host` A | 195.35.35.244 | MUST REMAIN DNS-ONLY | Hostinger |
| `host` AAAA | 2a02:4780:b:1710::… | MUST REMAIN DNS-ONLY | Hostinger |
| remaining 48 records | MX/TXT/CNAME | not IP-revealing | |

ccTLD zones are clean: `.co.uk`, `.ca`, `.com.au` each hold exactly one A for
apex and one for www, **both proxied**, to 3.222.110.146, plus a verification
TXT. Nothing to fix there.

**Only `update.` exposes a production origin.** `test.` and `help-test.` expose
other infrastructure whose ownership I could not confirm — classify before
touching.

## 5. CLOUDFLARE SOURCE RANGES (fetched live, not from memory)

Retrieved from `https://www.cloudflare.com/ips-v4` and `/ips-v6`, then
**cross-checked against `https://api.cloudflare.com/client/v4/ips`**. The two
sources matched exactly. Snapshot etag `38f79d050aa027e3be3865e495dcc9bc`,
fetched 2026-09-18.

**IPv4 — 15 CIDRs:**
```
173.245.48.0/20   103.21.244.0/22   103.22.200.0/22   103.31.4.0/22
141.101.64.0/18   108.162.192.0/18  190.93.240.0/20   188.114.96.0/20
197.234.240.0/22  198.41.128.0/17   162.158.0.0/15    104.16.0.0/13
104.24.0.0/14     172.64.0.0/13     131.0.72.0/22
```

**IPv6 — 7 CIDRs:**
```
2400:cb00::/32  2606:4700::/32  2803:f800::/32  2405:b500::/32
2405:8100::/32  2a06:98c0::/29   2c0f:f248::/32
```

That is **22 rules per port per server**. An AWS security group allows 60 rules
per group by default, so 80+443 across both protocols fits, but it is tight.

**Maintenance:** Cloudflare changes these rarely but does change them. Options,
best first:
1. **AWS-managed prefix list** per IP family, referenced by the SG. One list to
   update, both ports and both servers inherit it.
2. A monthly job that fetches both URLs, compares to the etag, and **alerts
   Derek rather than auto-applying**. Auto-applying firewall changes from a
   remote file is how you get locked out.
3. Manual quarterly review. Least good, but honest.

## 6. CERTIFICATE RENEWAL — THE TRAP THAT BREAKS IN 60 DAYS

All four certificates on WEST renew with `authenticator = nginx`, which is
**HTTP-01 over port 80**. Renewal timer: `snap.certbot.renew.timer`, last run
2026-09-17 21:39Z.

| certificate | expires | proxied? | validation arrives from | survives lockdown? |
|---|---|---|---|---|
| `www.poolrentalnearme.com` | Nov 3 2026 | yes | Cloudflare | **yes** |
| `poolrentalnearme.com` | Nov 26 2026 | yes | Cloudflare | **yes** |
| **`update.poolrentalnearme.com`** | Dec 5 2026 | **no** | **Let's Encrypt directly** | **NO — will fail** |
| **`chat.13.56.113.85.nip.io`** | Nov 3 2026 | **cannot be proxied** | **Let's Encrypt directly** | **NO — will fail** |

`nip.io` hostnames resolve to the IP embedded in the name, so that certificate
can never validate through Cloudflare. It is also **a second public disclosure
of the WEST origin IP**, right there in the hostname.

This would not fail at cutover. It would fail silently at the next renewal,
around 30 days before expiry, which is **early October**. Handle it in the same
change or accept a broken certificate later.

Three ways out, in order of preference:
1. Proxy `update.*` through Cloudflare, and retire or re-home the `nip.io`
   Chatwoot hostname onto a proper proxied name.
2. Move both to **DNS-01** validation with the Cloudflare DNS plugin. No inbound
   port 80 needed at all.
3. Allow port 80 from anywhere while restricting 443 to Cloudflare. Weakest:
   port 80 stays an open door for scanners.

## 7. ADMIN ACCESS AND LOCKOUT INSURANCE

- Port 22 is open to the world on both servers. Password authentication is
  **off** on WEST, so key-only.
- The only recent interactive login is root from `159.196.144.120`, 2026-09-04.
  **One data point is not an allowlist.** Confirm your current static IP before
  restricting 22.
- **AWS SSM is the safety net.** The agent is active and is how every command in
  this session ran. SSM is outbound-only from the instance: it keeps working
  even if all inbound ports are closed, including 22. **Do not disable it.**

Recommendation: restrict 22 to your known IP **only after** SSM is confirmed
working on both boxes, and keep SSM as the guaranteed way back in. If you would
rather not manage a changing home IP, close 22 entirely and use SSM exclusively.

## 8. `update.poolrentalnearme.com` — WHAT IT ACTUALLY IS

```nginx
server { server_name update.poolrentalnearme.com;
         location / { set $intercom "https://intercom.news";
                      proxy_set_header Host $host; proxy_pass $intercom; }
         listen 443 ... }
```

It is a **reverse proxy to `intercom.news`**, presumably a product-updates page.

Traffic over 14 days: **524 requests, overwhelmingly scanner noise** — WordPress
REST probes (`/wp-json/batch/v1` and a dozen variants, all 404), a
`CMS-Checker`, a Metabase CVE prober, and generic Chrome user agents. Real human
use appears negligible.

| question | answer |
|---|---|
| still required? | Unclear. It serves something, but measured demand is almost entirely scanners. **Ask whether anyone links to it.** |
| can it be proxied? | **Yes.** It is plain HTTP proxying; `Host` is preserved. Test that `intercom.news` accepts the extra hop |
| does anything rely on its direct IP? | Nothing found. No config outside nginx references it |
| rename/internalise? | Not needed if proxied |
| eventually remove? | **Probably.** If nobody links to it, deleting the record removes an exposure, 524 scanner requests, and a certificate to renew |

**Proxying it is strictly better than leaving it**, and deleting it may be better
still. Decide with product knowledge I do not have.

## 9. SAFE TARGET STATE (derived, not assumed)

### WEST sg-0183b7e0dcf8b5b59
| port | source | reason |
|---|---|---|
| 443 | 15 Cloudflare IPv4 + 7 IPv6 CIDRs | all public `.com` traffic |
| 80 | same 22 CIDRs | HTTP→HTTPS redirect and LE validation via Cloudflare |
| 80 | **conditional**: `0.0.0.0/0` **only if** `update.*` and the nip.io cert stay unproxied on HTTP-01 | see §6 |
| 22 | your static admin IP, or **closed entirely** with SSM only | |
| all else | removed | app ports already bind to 127.0.0.1 |

### EAST sg-09b527622baf115cf
| port | source | reason |
|---|---|---|
| 80 | **13.56.113.85/32 (WEST)** | **mandatory**, carries the whole .com homepage and pSEO |
| 80 | 22 Cloudflare CIDRs | the three ccTLDs proxy here |
| 443 | 22 Cloudflare CIDRs | ccTLD HTTPS |
| 22 | your static admin IP, or closed with SSM only | |
| 3000 | already closed — **leave closed** | node binds 0.0.0.0 but the SG blocks it |

Note EAST needs **both** WEST and Cloudflare on port 80. Dropping either breaks
something: without WEST the homepage dies, without Cloudflare the ccTLDs die.

## 10. LOCKOUT PREVENTION

1. **Before touching anything**, open a second SSH session and leave it open.
   An existing TCP connection survives a security-group change.
2. **Confirm SSM works on both boxes in the same hour**, since it is the path
   that does not depend on any inbound rule.
3. **Write down the current rules** by screenshotting both groups in the
   console. The automation identity cannot read them, so this is the only
   rollback baseline that will exist.
4. **Never remove the old rule and add the new one as separate steps.** Add the
   narrow rules first, verify, then remove the broad ones.
5. Do **EAST first**, not WEST. If EAST breaks, only the homepage and pSEO
   pages are affected, and WEST can still serve the marketplace. If WEST breaks,
   everything is down.
6. Have the AWS console open on a device with a different network path, in case
   your primary IP is the one you just locked out.

## 11. IMPLEMENTATION ORDER (do not run any of this yet)

**Phase A — remove the disclosures (no firewall change, fully reversible)**
1. Decide the fate of `update.poolrentalnearme.com`: proxy it, or delete it.
2. Decide the fate of `chat.13.56.113.85.nip.io`: re-home it onto a proxied
   hostname, or retire it.
3. Classify `test.` and `help-test.`; delete if stale.
4. Verify the site is unaffected. **Stop here for a day and watch.**

**Phase B — fix certificate validation before it can bite**
5. Either confirm every remaining certificate validates through Cloudflare, or
   switch the exposed ones to DNS-01 with the Cloudflare plugin.
6. Force a dry-run renewal (`certbot renew --dry-run`) and confirm success.

**Phase C — EAST lockdown (lower blast radius)**
7. Screenshot sg-09b527622baf115cf.
8. **Add** 13.56.113.85/32 on port 80, and the 22 Cloudflare CIDRs on 80 and 443.
9. Verify: homepage loads, a `/p/*` page loads, all three ccTLDs load.
10. **Then remove** the broad 0.0.0.0/0 rules on 80 and 443.
11. Re-verify, and confirm `http://3.222.110.146/` from outside now fails.

**Phase D — WEST lockdown**
12. Screenshot sg-0183b7e0dcf8b5b59.
13. Add the 22 Cloudflare CIDRs on 443 and 80.
14. Verify the marketplace, login, checkout and the mobile-app API paths.
15. Remove the broad rules.
16. Confirm `https://13.56.113.85` with SNI now fails.

**Phase E — admin ports, last and separately**
17. Only after everything above is stable, restrict port 22.

## 12. ROLLBACK

Every step is a single security-group rule change and reverses the same way:
re-add the `0.0.0.0/0` rule on the affected port. Recovery paths in order:

1. **SSM** — works with all inbound ports closed. This is the real safety net.
2. The still-open SSH session from step 1 of §10.
3. AWS console → EC2 → Security Groups → re-add the broad rule.
4. EC2 Serial Console / instance screenshot if the box itself is wedged, though
   no step here touches the host configuration, so this should never be needed.

DNS changes in Phase A roll back by flipping the proxy toggle or re-creating the
record. Certificate changes in Phase B roll back by restoring the renewal config.

## 13. VERIFICATION PLAN (after any future implementation)

| check | method | pass criterion |
|---|---|---|
| site works through Cloudflare | GET `/`, `/p/*`, `/s`, `/login` | 200 with real content, not just a 200 |
| direct origin fails | `https://13.56.113.85` + SNI; `http://3.222.110.146/` | connection refused or timeout |
| WEST→EAST intact | homepage and `/p/*` render, `/fw-assets/__build.json` correct SHA | 200 |
| ccTLDs intact | all three apex and www | 200 |
| Googlebot unaffected | origin logs for Googlebot status mix | no new 403, 429 or 5xx |
| admin access | SSH plus an SSM command on both boxes | both succeed |
| deployment works | `ops/deploy-east.sh` full ritual including `verify:production` | PASS, and the verifier is not rate-limited |
| certificates | `certbot renew --dry-run` on both boxes | success for **every** certificate |
| monitoring | UptimeRobot dashboard | no new alerts |
| webhooks | replay or observe one inbound call per integration | delivered |
| mobile apps | iOS and Android cold start, browse, book | unaffected |

The deploy verifier is the check most likely to surprise you: it fetches ~500
URLs through Cloudflare and already required a rate-limit exemption.

## 14. RESIDUAL RISKS AFTER ALL OF THIS

- The origin IP remains in **historical DNS records** permanently. The security
  group is the control; hiding the IP is not.
- Cloudflare CIDR changes will silently break traffic unless maintained. Use a
  managed prefix list and alerting.
- The WEST→EAST hop stays **unencrypted over the public internet**. Closing EAST
  to everything except WEST and Cloudflare reduces exposure but does not encrypt
  it. Worth a separate decision later.
- Anyone inside a Cloudflare IP range can still reach the origin, which is why
  the WAF, rate limiting and the `st-authinfo` cache bypass still matter. For
  full assurance, Cloudflare **Authenticated Origin Pulls** (mTLS) is the next
  step, and it is free.
