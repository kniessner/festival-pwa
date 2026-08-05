#!/usr/bin/env bash
# Festival PWA Standalone — Production Deploy (SSH)
# Rsyncs the current standalone build to bucht-der-traeumer.de/webapp over SSH.
#
# Usage: ./scripts/deploy-prod.sh [--dry-run]
#
# Target: htdocs/webapp/ on the WordPress.com Atomic host. Apache serves
# that directory directly (same mechanism the existing /pwa symlink relies
# on). This path used to be /app, which shadowed an unrelated WordPress
# page — see standalone/docs/plans/2026-07-27-i18n-de-en-round1.md context
# for why that mechanism works. The old htdocs/app/ content on the server
# is left in place (not cleaned up automatically); remove it by hand once
# nothing still links to /app.
#
# This does NOT touch wp-content/plugins/festival-pwa/ (a separate git
# checkout on the server with its own uncommitted edits) or the /pwa path.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SSH_TARGET="buchtdertraeumer.wordpress.com@ssh.wp.com"
REMOTE_APP_DIR="htdocs/webapp/"
LIVE_URL="https://bucht-der-traeumer.de/webapp/"

RSYNC_FLAGS=(-avz)
if [ "$1" = "--dry-run" ]; then
    RSYNC_FLAGS+=(--dry-run)
    echo "🧪 Dry run — no files will actually be transferred"
fi

# The WP plugin's "PWA Push" and "Music" post types write notifications.json
# and music.json directly on the server (see includes/class-notifications.php
# and includes/class-music.php), in both data/ and data/en/ — excluded here so
# a deploy never overwrites that live content with the local repo's copies
# (which are just blank placeholders for local dev/offline fallback). The
# exclude patterns must list both locations explicitly: rsync's exclude
# matches the exact relative path, so data/notifications.json would NOT also
# catch data/en/notifications.json.
RSYNC_FLAGS+=(
    --exclude=data/notifications.json --exclude=data/en/notifications.json
    --exclude=data/music.json --exclude=data/en/music.json
)

# Runtime files the app actually needs. Mirrors deploy.sh's dist/ build list
# (index.html, manifest.json, sw.js, js/, css/, data/, images/, icons/) —
# scripts/, docs/, .log/, and README/STRATEGY.md are dev-only and excluded.
DEPLOY_FILES=(index.html manifest.json sw.js js css data images icons)

# Every deploy ships a fresh cache-busted sw.js + index.html, so a change
# never goes out under a version the device has already cached (see
# scripts/bump-cache-version.sh for why sw.js and index.html are bumped
# together instead of separately).
if [ "$1" != "--dry-run" ]; then
    NEW_VERSION="$("$SCRIPT_DIR/bump-cache-version.sh")"
    echo "🔁 Cache version bumped to $NEW_VERSION"
fi

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

# The host sits behind WordPress.com's edge cache (Batcache-style), which
# caches the /app/ response independently of the files on disk — without
# this, visitors (and our own verification below) can keep seeing a stale
# snapshot for a while after a successful rsync.
echo ""
echo "🧹 Purging edge cache for $LIVE_URL ..."
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" "wp edge-cache purge '$LIVE_URL' '${LIVE_URL%/}'" || echo "   ⚠️  Edge cache purge failed — page may serve stale content until the cache naturally expires"

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
