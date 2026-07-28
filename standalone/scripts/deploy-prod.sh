#!/usr/bin/env bash
# Festival PWA Standalone — Production Deploy (SSH)
# Rsyncs the current standalone build to bucht-der-traeumer.de/app over SSH.
#
# Usage: ./scripts/deploy-prod.sh [--dry-run]
#
# Target: htdocs/app/ on the WordPress.com Atomic host. Apache serves that
# directory directly (same mechanism the existing /pwa symlink relies on),
# shadowing the unrelated WordPress page that otherwise lives at /app —
# see standalone/docs/plans/2026-07-27-i18n-de-en-round1.md context for why.
#
# This does NOT touch wp-content/plugins/festival-pwa/ (a separate git
# checkout on the server with its own uncommitted edits) or the /pwa path.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SSH_TARGET="buchtdertraeumer.wordpress.com@ssh.wp.com"
REMOTE_APP_DIR="htdocs/app/"
LIVE_URL="https://bucht-der-traeumer.de/app/"

RSYNC_FLAGS=(-avz)
if [ "$1" = "--dry-run" ]; then
    RSYNC_FLAGS+=(--dry-run)
    echo "🧪 Dry run — no files will actually be transferred"
fi

# Runtime files the app actually needs. Mirrors deploy.sh's dist/ build list
# (index.html, manifest.json, sw.js, js/, css/, data/, images/, icons/) —
# scripts/, docs/, .log/, and README/STRATEGY.md are dev-only and excluded.
DEPLOY_FILES=(index.html manifest.json sw.js js css data images icons)

echo "🚀 Festival PWA Standalone — Production Deploy"
echo "   Source: $ROOT_DIR"
echo "   Target: $SSH_TARGET:$REMOTE_APP_DIR"
echo "   Live:   $LIVE_URL"
echo ""

ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" "mkdir -p $REMOTE_APP_DIR"

cd "$ROOT_DIR"
rsync "${RSYNC_FLAGS[@]}" \
    "${DEPLOY_FILES[@]}" \
    "$SSH_TARGET:$REMOTE_APP_DIR"

if [ "$1" = "--dry-run" ]; then
    echo ""
    echo "✅ Dry run complete — no changes made"
    exit 0
fi

echo ""
echo "🔎 Verifying $LIVE_URL ..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$LIVE_URL")
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Live and responding (HTTP 200)"
else
    echo "   ⚠️  Unexpected response: HTTP $HTTP_CODE — check manually"
fi

echo ""
echo "✅ Deployed to $LIVE_URL"
