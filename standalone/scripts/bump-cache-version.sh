#!/usr/bin/env bash
# Bumps sw.js's CACHE_VERSION and syncs every ?v= cache-busting param in
# index.html to the same value, in one step — so the two can never drift
# apart (which is what happened when update.sh bumped only sw.js on its
# own). Called from build.js and deploy-prod.sh; run it directly if you
# just need a fresh version without building or deploying.
#
# Usage: ./scripts/bump-cache-version.sh
# Prints the new version on stdout (nothing else), so callers can do:
#   NEW_VERSION="$(./scripts/bump-cache-version.sh)"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SW_FILE="$ROOT_DIR/sw.js"
HTML_FILE="$ROOT_DIR/index.html"

NEW_VERSION="$(date +%s)"

sed -i.bak "s/const CACHE_VERSION = '[^']*'/const CACHE_VERSION = '$NEW_VERSION'/" "$SW_FILE"
rm -f "$SW_FILE.bak"

sed -i.bak -E "s/\?v=[0-9]+/?v=$NEW_VERSION/g" "$HTML_FILE"
rm -f "$HTML_FILE.bak"

echo "$NEW_VERSION"
