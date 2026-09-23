# WEST deploy preflight

`env_preflight.py` certifies that a candidate container's environment matches the
running MAIN container before any flip. Names only are printed; values never.

Installed on WEST as `/home/ubuntu/env_preflight.py`, and called from two places.
Every new `gate-cNNN.sh` / `flip-cNNN.sh` is copied from the previous one, so
both calls carry forward:

- **gate**, right after the candidate is healthy:
  `python3 /home/ubuntu/env_preflight.py --main-container "$MAIN" --candidate-container "$FB" || abort "env preflight failed"`
- **flip, step 0, before nginx is touched:** the flip refuses unless
  `gate-cNNN.done` reads `OK` **and** a fresh preflight of the gate container passes.

Same change to the flip template: the rollback container is now started with the
cloned production env (`--env-file "$ENVF"`). Before, it ran with no env, so a
rollback to it would have served a broken app.

Tests: `cd ops/deploy && python3 -m unittest test_env_preflight -v`.
They cover a complete env, one missing, several missing, extra harmless names, an
empty value, a candidate from `build/.env` alone, and a broken MAIN.

Proven on WEST on 2026-09-23:
- MAIN vs itself: PASS (53 names).
- `build/.env` as a file: FAIL, 16 missing, including `STRIPE_SECRET_KEY`,
  `SUPABASE_URL` and `VITE_SHARETRIBE_USING_SSL`.
- A container created, never started, from `build/.env`: FAIL, same names.
- A missing container: FAIL.
- A flip whose gate never passed, was ABORTED, or whose candidate was built from
  `build/.env`: all aborted at step 0 with nginx untouched.
