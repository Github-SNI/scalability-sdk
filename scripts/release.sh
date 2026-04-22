#!/usr/bin/env bash
# Release script: build minified, recompute SRI, update README, commit, tag, push.
#
# Usage:
#   npm run release -- v2.2.0
#   ./scripts/release.sh v2.2.0
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 vX.Y.Z" >&2
  exit 1
fi

TAG="${VERSION#v}"
TAG="v${TAG}"
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must match vX.Y.Z (got: $TAG)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ---- Preflight ----
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "ERROR: must be on 'main' (currently on '$CURRENT_BRANCH')." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree must be clean. Uncommitted changes:" >&2
  git status --short >&2
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "ERROR: tag $TAG already exists locally." >&2
  exit 1
fi

if git ls-remote --tags origin "$TAG" 2>/dev/null | grep -q "refs/tags/${TAG}$"; then
  echo "ERROR: tag $TAG already exists on origin." >&2
  exit 1
fi

echo "==> Fetching origin and ensuring main is up to date..."
git fetch origin main --quiet
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "ERROR: local main is not in sync with origin/main. Run 'git pull --ff-only' first." >&2
  exit 1
fi

# ---- Build ----
echo "==> Installing dependencies..."
npm install --no-audit --no-fund --silent

echo "==> Building minified bundles..."
npm run build --silent

# ---- SRI ----
echo "==> Computing SRI hashes..."
sri() { openssl dgst -sha384 -binary "$1" | openssl base64 -A; }
SDK_SRI="$(sri sdk/scale-sdk-v2.js)"
SDK_MIN_SRI="$(sri sdk/scale-sdk-v2.min.js)"
ANA_SRI="$(sri sdk/scale-analytics.js)"
ANA_MIN_SRI="$(sri sdk/scale-analytics.min.js)"

printf "  scale-sdk-v2.js         sha384-%s\n" "$SDK_SRI"
printf "  scale-sdk-v2.min.js     sha384-%s\n" "$SDK_MIN_SRI"
printf "  scale-analytics.js      sha384-%s\n" "$ANA_SRI"
printf "  scale-analytics.min.js  sha384-%s\n" "$ANA_MIN_SRI"

# ---- README ----
echo "==> Rewriting CDN snippets in README.md..."
node scripts/update-readme.js "$TAG" "$SDK_SRI" "$SDK_MIN_SRI" "$ANA_SRI" "$ANA_MIN_SRI"

# ---- package.json version ----
echo "==> Bumping package.json version..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${TAG#v}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ---- Review ----
echo ""
echo "==> Changes staged for the release commit:"
git --no-pager diff --stat
echo ""

# Allow skipping the prompt in CI: RELEASE_YES=1
if [[ "${RELEASE_YES:-0}" != "1" ]]; then
  read -r -p "Commit, tag $TAG, and push to origin? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted. Changes left uncommitted."
    exit 1
  fi
fi

# ---- Commit / tag / push ----
echo "==> Committing..."
git add package.json README.md sdk/scale-sdk-v2.min.js sdk/scale-analytics.min.js
git commit -m "release: ${TAG}"

echo "==> Tagging $TAG..."
git tag "$TAG"

echo "==> Pushing main and $TAG..."
git push origin main "$TAG"

echo ""
echo "Release ${TAG} pushed. GitHub Actions will publish the release in ~30-60s."
echo ""
echo "Verify once CI finishes:"
echo "  curl -sI https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@${TAG}/sdk/scale-sdk-v2.min.js | head -1"
