# DO NOT DEPLOY this branch — it changes the final guest charge

Exhaustive differential (2026-09-23), current production checkout vs this branch:
- baskets: host $1.00–$500.00 by the cent × 1, 1.5, 2, 2.5, 3, 4, 6, 8, 12 h × 9 add-on sets
  (none, one, several, odd-cent, half-cent-triggering) = 4,041,981
- final guest charge changed: 1,125,262 (27.8%), every change exactly ±1¢
- baskets with no add-ons: 0 changes
- the arithmetic model was checked against the real old and new `transactionLineItems`
  on 60,000 random baskets each: 0 mismatches

Cause: production rounds the 15% fee once on the whole subtotal; this branch rounds it
per line. That is a monetary-policy change, which was not authorized. Display options
that keep checkout unchanged are listed in the session report.
