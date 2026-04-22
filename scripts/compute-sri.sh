#!/usr/bin/env bash
# Prints SHA-384 SRI hashes for all SDK files. Debug utility.
# Usage: npm run sri
set -euo pipefail

cd "$(dirname "$0")/.."

for f in sdk/scale-sdk-v2.js sdk/scale-sdk-v2.min.js sdk/scale-analytics.js sdk/scale-analytics.min.js; do
  if [[ ! -f "$f" ]]; then
    printf "%-40s (missing — run 'npm run build')\n" "$f"
    continue
  fi
  hash="$(openssl dgst -sha384 -binary "$f" | openssl base64 -A)"
  printf "%-40s sha384-%s\n" "$f" "$hash"
done
