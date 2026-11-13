# Host supporter test page (static)

One static page that asks hosts for voluntary monthly support and links to three Stripe Payment Links
($5, $10, $20 a month). No backend. Built 2026-11-13 to test whether hosts will pay before building anything larger.

- Hosted on Vercel: team "DEREK BOWEN", project `prnm-support` (prj_TBHVfokNGRZZTpCnQb41wHOnhaWB).
- Live at https://prnm-support-derekbowencorp-5352.vercel.app/ (noindex).
- Public address: https://support.poolrentalnearme.com (live since 2026-11-13; verified on Vercel, served through Cloudflare).
- Vercel's login wall (Vercel Authentication) was turned off for this project so hosts can open it.

## DNS records (added by Derek in Cloudflare, zone poolrentalnearme.com)

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `support` | `ed75c107ce4bb8ba.vercel-dns-016.com` | currently proxied; works |
| TXT | `_vercel` | `vc-domain-verify=support.poolrentalnearme.com,297a354416f6ffd55881` | n/a |

## Copy notes

- The letter is Derek's, word for word, except one sentence: "Active supporters will receive priority support..."
  became "Supporters at $20 a month receive customer service..." so it matches the $5 and $10 options.
- $5 and $10 do not include customer service; $20 does.
- Seller named on the page: 10000 Solutions LLC (what the Stripe checkout shows).
- Cancel instructions say to email support@poolrentalnearme.com. Replace with Stripe's customer portal link when it is turned on.
- No insurance benefit is claimed; only the one approved sentence appears.
- The 2027 requirement is not mentioned on this page.
- The $40/month advertising add-on section uses Derek's own wording from his Stripe product.

## Updating

1. Edit the files here, refresh `SHA1SUMS` (`sha1sum index.html logo.png share.png apple-touch-icon.png > SHA1SUMS`), commit and push.
2. Redeploy the `prnm-support` project (target production) with one uploaded file, `build.sh`, build command `sh build.sh`,
   output directory `public`. `build.sh` downloads these files from the pinned commit on GitHub and checks their hashes;
   put the new commit id in it.
3. Cloudflare caches `/` on every hostname in the zone for 10 minutes, so the bare address can show the old page for up to
   10 minutes after a deploy. Adding `?v=2` to the address shows the new page at once.

`share.png` (1200x630) is the picture shown when the link is shared; `apple-touch-icon.png` is the icon phones show.
