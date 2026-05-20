#!/usr/bin/env bash
# Smoke-test for the published SDK on jsdelivr.
#
# Usage:
#   bash scripts/smoke-test-cdn.sh                # checks @latest
#   bash scripts/smoke-test-cdn.sh v2.7.0         # checks a specific tag
#
# Exit code 0 = all 3 files reachable + correct version + new code
# present (sendBeacon, scale:visit-failed, keepalive).

set -euo pipefail

REF="${1:-latest}"
BASE="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@${REF}/sdk"
EXPECTED_VERSION="${EXPECTED_VERSION:-}"  # optional, e.g. EXPECTED_VERSION=2.7.0
FILES=("scale-sdk-v2.min.js" "scale-analytics.min.js" "scale-bootstrap.min.js")
FAIL=0

echo "==> Smoke testing scalability-sdk @ $REF"
echo "    Base: $BASE"
echo ""

for f in "${FILES[@]}"; do
  url="$BASE/$f"
  echo "  $f"
  HEADERS="$(curl -sI "$url")"
  STATUS="$(echo "$HEADERS" | awk 'NR==1 {print $2}')"
  VERSION="$(echo "$HEADERS" | awk -F': ' '/^x-jsd-version:/ {print $2}' | tr -d '\r')"
  SIZE="$(echo "$HEADERS"   | awk -F': ' '/^content-length:/ {print $2}' | tr -d '\r')"

  if [[ "$STATUS" != "200" ]]; then
    echo "    ✗ HTTP $STATUS"
    FAIL=1
    continue
  fi
  echo "    ✓ HTTP 200  version=${VERSION:-?}  size=${SIZE:-?}"

  if [[ -n "$EXPECTED_VERSION" && "$VERSION" != "$EXPECTED_VERSION" ]]; then
    echo "    ✗ expected version $EXPECTED_VERSION, got $VERSION"
    FAIL=1
  fi
done

echo ""
echo "==> Checking new code markers in scale-sdk-v2.min.js (v2.7.0 features)"
BODY="$(curl -s "$BASE/scale-sdk-v2.min.js")"
for marker in "scale:visit-failed" "sendBeacon" "keepalive"; do
  if echo "$BODY" | grep -q -- "$marker"; then
    echo "  ✓ $marker present"
  else
    echo "  ✗ $marker MISSING — old version still served (jsdelivr cache)?"
    FAIL=1
  fi
done

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "✓ all checks passed"
else
  echo "✗ at least one check failed"
  echo ""
  echo "If you just pushed and the new code is missing, jsdelivr may"
  echo "still be serving cached content. Force-refresh with:"
  echo "  curl 'https://purge.jsdelivr.net/gh/Github-SNI/scalability-sdk@${REF}/sdk/scale-sdk-v2.min.js'"
fi
exit "$FAIL"
