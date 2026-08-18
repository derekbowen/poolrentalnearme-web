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
BANNED='fully insured|fully covered|all bookings are insured|every booking is (insured|covered)|your pool is protected|hosts are protected|up to \$[0-9,]+ in coverage'

fail=0

banned=$(grep -rInE "$BANNED" src/ server/ --include='*.js' --include='*.jsx' 2>/dev/null || true)
if [ -n "$banned" ]; then
  echo "BLOCKED: prohibited insurance phrasing (never allowed, no baseline):"
  echo "$banned"
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
