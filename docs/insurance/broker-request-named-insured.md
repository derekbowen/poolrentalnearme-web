# Broker request — correct the named insured to PRNM Corp

**Status:** drafted, NOT sent. Needs Derek's send.
**To:** Josh Dunmire, Undercard Group — Joshua@undercardgroup.com
**Re:** Policy CSG-00536699-00 (Spinnaker / Coterie), effective 2026-08-17

---

Josh,

Two things on CSG-00536699-00.

**1. Named insured.** The declarations issue the policy to "Pool Rental Near Me."
That is our trade name, not the contracting entity. The marketplace terms of
service, the host agreement, and the Stripe platform account are all **PRNM Corp,
a Delaware corporation**, a subsidiary of 10,000 Solutions LLC. Mailing address
is PRNM Corp, c/o 10,000 Solutions LLC, 7785 Halbrook Terrace, Riverside, CA
92509.

Can you have this endorsed to read PRNM Corp as the named insured, with "Pool
Rental Near Me" carried as a DBA? We would rather fix the entity now than argue
about it at a claim. Please confirm whether the endorsement is effective back to
inception or from the endorsement date.

**2. Other Insurance — which clause is operative.** The declarations describe the
business as "Offices of Residential Property Managers (excess over any property
owner or sharing platform liability insurance)." Section III H.2 of BP 00 03 is
narrower than that: it makes Business Liability excess only over insurance for
direct physical loss or damage, or over other primary insurance covering
premises or operations for which we have been added as an additional insured.
`CTF CW ANTISTCK 03 21` then replaces H.2 with anti-stacking language between
Coterie-issued policies.

We need to be able to answer a host who asks "whose insurance responds first."
Which clause governs, and in what order does this policy respond relative to a
host's own homeowners or landlord policy?

**3. Additional insured for hosts.** `CTF CW AIMPB 08 23` is blanket but reads to
premises leased or rented **to us**. Our hosts license their pool to a guest; we
are the platform, not the tenant. Is there any way to structure the host
agreement so that endorsement is triggered — or does making any host-facing
protection claim require a separate product (participant accident, host
liability)? We are making no such claim today and will not until you tell us one
is supportable.

Thanks,
Derek Bowen
Pool Rental Near Me
(909) 272-8096

---

## Why this is blocking

`src/config/insurance.config.js` will not publish any insurance copy while
`named_insured` is null. Answers to 2 and 3 above determine whether any further
sentence can be added to the approved-copy table.
