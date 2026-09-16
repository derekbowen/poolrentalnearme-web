# 2026-09-16 — wizard rejected a Canadian address (Assad Jamil, Ottawa)

Host text relayed by Derek 2026-09-16: "I tried to complete the process, but it would not
recognize my Canadian address." Account `6aaaa47c-01ea-4c4a-85d9-15ae4a4bc368`, signed up
14:15Z via Apple, postal code K4A 1A2, Stripe payouts connected 14:21Z, opened `/wizard/`
14:21:57Z, imported Swimply 39945 "Orleans Oasis" (13 photos, ok), then stopped. No listing.

**Cause.** The wizard's address step (`/home/ubuntu/merlin/dist/assets/index-4d5740d4.js`,
built output only, no source) constructs Google Places Autocomplete with
`componentRestrictions:{country:"us"}`. A Canadian address never appears in the dropdown, and
only a dropdown selection fills city/province/postal/lat/lng, so publishing is hard-blocked
("Pick your address from the dropdown…"). Nothing else in the wizard or its server is
US-specific: the timezone map keyed on US state falls back to the browser timezone, pricing is
USD for every listing, the marketplace geocoder has no country limit.

**Change (Derek GO, 17:02:41Z).** That one literal is now
`componentRestrictions:{country:["us","ca","gb","au"]}` (the four countries PRNM serves with
ccTLDs and Stripe payouts). Backup: `index-4d5740d4.js.bak-countries-20260916-170241` beside
it. Express serves the file from disk with `max-age=0`, so it was live on the next page load;
verified by fetching the public bundle. No container restart.

**Still true from `host-address-bug-2026-09-12.md`:** the address component rebuilds the
Autocomplete on every keystroke and swallows load errors; unchanged, still no source.

**Outbound.** Twilio path skips non-US numbers, so any reply to +1 613 goes from Derek or by
Emailit; none sent by the agent.
