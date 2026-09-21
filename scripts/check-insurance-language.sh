#!/usr/bin/env bash
# Fail the build when NEW insurance language appears outside the approved surfaces.
#
# The June incident happened because insurance claims spread file by file, each
# one individually plausible. This makes that spread visible at commit time
# instead of at incident time.
#
# Two rules:
#   1. Prohibited phrasings are banned everywhere, no baseline, no exceptions.
#      These are the exact phrasings that caused June.
#   2. Any other insurance/coverage reference outside the approved files must
#      already be in the baseline. New ones fail the build.
#
# The approved wording itself lives in APPROVED_COPY in
# src/config/insurance.config.js, reproduced from APPROVED-LANGUAGE.md.
# Adding an approved sentence means editing that table, not this script.
#
# Approved to contain insurance copy:
#   src/config/insurance.config.js          the single source of truth
#   src/components/InsuranceDisclosure/     the only approved copy
#   src/containers/TermsOfServicePage/      the legal document itself
#   src/containers/HostPreparednessPolicyPage/   incorporated policy
#
# To accept a new match deliberately:  bash scripts/check-insurance-language.sh --update-baseline
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

BASELINE="scripts/insurance-language.baseline"

# \b on liability alone still matches "reliability"; require a non-letter before it.
PATTERN='insur|(^|[^A-Za-z])liability|[^A-Za-z]coverage([^A-Za-z]|$)|is insured|are insured|we cover |is covered by'
ALLOW='^(src/config/insurance\.config\.js|src/components/InsuranceDisclosure/|src/containers/TermsOfServicePage/|src/containers/HostPreparednessPolicyPage/)'

# Never acceptable anywhere, including inside the approved files.
# Sources: the June incident (first block) and the banned-strings list in
# APPROVED-LANGUAGE.md (the rest). Each of these is false under the policy:
#   - hosts are not insureds, so no "covered"/"protected" framing survives
#   - Section I Property is deleted, so nothing about a pool or home is covered
#   - only Spinnaker (underwriter) and Coterie (administrator) are on this policy
#   - cyber, data-privacy, and data-related liability are all excluded
BANNED='fully insured|fully covered|all bookings are insured|every booking is (insured|covered)|your pool is protected|hosts are protected|up to \$[0-9,]+ in coverage'
BANNED="$BANNED"'|hosts are covered|you.?re protected|you are protected|host protection|guest protection guarantee'
BANNED="$BANNED"'|your (pool|home|property|data) (is|are) (covered|insured|protected)'
# Carrier names only. Travelers / Nationwide / State Farm are deliberately NOT
# here: "travelers" and "nationwide" are ordinary words in marketplace copy and
# a guard that cries wolf gets disabled.
BANNED="$BANNED"'|hartford|lloyd.?s of london|chubb|a-rated carrier|our a.rated'
BANNED="$BANNED"'|\$2M host|\$2 ?million host'
# Added 2026-09-21 (Derek). Two new classes:
#  (a) automatic/universal coverage framing — nobody is insured by default, and
#      the policy does not attach to a booking, a host, or a renter;
#  (b) the stale blanket denial. "PRNM does not provide or arrange insurance"
#      was true before 2026-08-17 and is false now; it must not come back as a
#      substitute for the marketing block while the gate is shut. Omit instead.
BANNED="$BANNED"'|automatically insured|insured automatically|insurance on every booking'
BANNED="$BANNED"'|every (booking|host|renter|guest|rental) is (insured|covered)'
BANNED="$BANNED"'|(each|every) booking (is|comes) (insured|covered|with insurance)'

# The stale blanket denial, scanned separately because it is banned in MARKETING
# copy only. "PRNM does not provide or arrange insurance" was true before
# 2026-08-17 and reads as false now that a CGL policy is bound; it must not come
# back as a stand-in for the marketing block while the publish gate is shut. The
# correct behaviour there is to omit the block, not to deny.
#
# It is NOT banned in the legal documents. ToS §11.1 ("PRNM does not provide,
# arrange, underwrite, or guarantee insurance of any kind to Hosts, Renters, or
# their guests") is a different and still-accurate statement: PRNM's own policy
# covers PRNM's operations, hosts are not additional insureds, and Section I
# Property is deleted. That section is counsel's to change, not this guard's.
STALE='does not (provide|offer|arrange|carry) (or arrange )?insurance'
STALE="$STALE"'|(provides|offers|arranges) no insurance'
STALE_ALLOW='^(src/containers/TermsOfServicePage/|src/containers/HostPreparednessPolicyPage/|src/containers/PrivacyPolicyPage/)'

# The policy number is an internal administrative record. It must never appear
# in anything that can be bundled, served, or crawled. Matched BY SHAPE so the
# number itself is not written into this guard. docs/ is out of scope here on
# purpose: that is where the internal record legitimately lives.
POLICY_SHAPE='[A-Z]{2,4}-[0-9]{6,10}-[0-9]{2}'

fail=0

policy=$(grep -rInE "$POLICY_SHAPE" src/ server/ public/ --include='*.js' --include='*.jsx' \
  --include='*.json' --include='*.css' --include='*.html' 2>/dev/null || true)
if [ -n "$policy" ]; then
  echo "BLOCKED: what looks like an insurance policy number in bundled/served source."
  echo "It belongs in docs/insurance/policy-facts.json only."
  echo "$policy"
  fail=1
fi

# Pure comment lines are excluded from the BANNED scan. The changelog comments
# in host-preparedness-2026-1.js name the phrases that were REMOVED, and a guard
# that blocks the record of a fix pressures the next person to delete the record.
# A comment cannot reach a user; a rendered string can, and those still fail.
banned=$(grep -rInEi "$BANNED" src/ server/ --include='*.js' --include='*.jsx' 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*)' || true)
if [ -n "$banned" ]; then
  echo "BLOCKED: prohibited insurance phrasing (never allowed, no baseline):"
  echo "$banned"
  fail=1
fi

stale=$(grep -rInEi "$STALE" src/ server/ --include='*.js' --include='*.jsx' 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+: *(//|\*|/\*)' \
  | grep -vE "$STALE_ALLOW" || true)
if [ -n "$stale" ]; then
  echo "BLOCKED: stale blanket insurance denial in marketing copy."
  echo "PRNM has carried a commercial general liability policy since 2026-08-17."
  echo "While the publish gate is shut, OMIT the insurance block — do not deny."
  echo "$stale"
  fail=1
fi

current=$(grep -rlInE "$PATTERN" src/ server/ --include='*.js' --include='*.jsx' 2>/dev/null \
  | grep -vE "$ALLOW" | sort -u || true)

if [ "${1:-}" = "--update-baseline" ]; then
  echo "$current" > "$BASELINE"
  echo "baseline updated: $(wc -l < "$BASELINE") file(s)"
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "BLOCKED: no baseline. Run: bash scripts/check-insurance-language.sh --update-baseline"
  exit 1
fi

new=$(comm -13 "$BASELINE" <(echo "$current") || true)
if [ -n "$new" ]; then
  echo "BLOCKED: insurance/coverage language in file(s) not previously carrying it."
  echo "Put approved copy in src/components/InsuranceDisclosure/ instead."
  echo "$new"
  fail=1
fi

[ "$fail" -eq 0 ] && echo "OK: no new insurance language outside approved surfaces."
exit "$fail"
