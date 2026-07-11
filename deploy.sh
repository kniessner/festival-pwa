#!/usr/bin/env bash
#
# One-click deploy script for the Festival PWA plugin.
# Pushes the local plugin files to the WP.com SSH host via rsync.
#
# Usage:
#   ./deploy.sh
#   ./deploy.sh --dry-run    # preview changes without uploading
#
# The script will ask for confirmation unless --force is passed.
#

set -euo pipefail

REMOTE_USER="buchtdertraeumer.wordpress.com"
REMOTE_HOST="ssh.wp.com"
REMOTE_PATH="/home/150887845/htdocs/wp-content/plugins/festival-pwa"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

DRY_RUN=false
FORCE=false

for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=true
            ;;
        --force)
            FORCE=true
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--force]"
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Usage: $0 [--dry-run] [--force]"
            exit 1
            ;;
    esac
done

RSYNC_OPTS=(
    -avz
    --delete
    --exclude='.git'
    --exclude='.superpowers'
    --exclude='.DS_Store'
    --exclude='.claude'
    --exclude='deploy.sh'
    --exclude='*.md'
    --exclude='PLAN.md'
    --exclude='DOCUMENTATION.md'
    --exclude='AUDIT-*.md'
    --exclude='SETUP-GUIDE.md'
    --exclude='node_modules'
    --exclude='package.json'
    --exclude='package-lock.json'
    --exclude='yarn.lock'
    --exclude='.gitignore'
    --exclude='.editorconfig'
    --exclude='.prettierrc'
    --exclude='pwa/data'
    --exclude='pwa/snapshots'
    --exclude='pwa/cache'
)

if [[ "$DRY_RUN" == true ]]; then
    RSYNC_OPTS+=(--dry-run)
fi

REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

echo "================================================"
echo " Festival PWA Deploy"
echo "================================================"
echo " Local:  ${LOCAL_DIR}"
echo " Remote: ${REMOTE_TARGET}"
echo " Mode:   $([[ "$DRY_RUN" == true ]] && echo 'DRY RUN' || echo 'LIVE')"
echo "================================================"

if [[ "$FORCE" == false && "$DRY_RUN" == false ]]; then
    echo ""
    read -r -p "Deploy these files? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo ""
echo "Running rsync..."
rsync "${RSYNC_OPTS[@]}" "${LOCAL_DIR}/" "${REMOTE_TARGET}/"

if [[ "$DRY_RUN" == true ]]; then
    echo ""
    echo "Dry run complete. No files were uploaded."
else
    echo ""
    echo "Deployment complete."
    echo "Visit https://bucht-der-traeumer.de/pwa/ to test."
fi
