#!/usr/bin/env bash
# Festival PWA Standalone — Deploy Script
# Prepares the standalone folder for deployment to static hosting.
#
# Usage: ./scripts/deploy.sh [--target-dir DIR] [--zip]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR=""
ZIP=false

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --target-dir)
            BUILD_DIR="$2"
            shift 2
            ;;
        --zip)
            ZIP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$BUILD_DIR" ]; then
    BUILD_DIR="$ROOT_DIR/dist"
fi

echo "📦 Festival PWA Standalone — Deploy"
echo "   Source: $ROOT_DIR"
echo "   Target: $BUILD_DIR"
[ "$ZIP" = true ] && echo "   Output: ${BUILD_DIR}.zip"
echo ""

# Clean + create build dir
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy all needed files
cp "$ROOT_DIR/index.html" "$BUILD_DIR/"
cp "$ROOT_DIR/manifest.json" "$BUILD_DIR/"
cp "$ROOT_DIR/sw.js" "$BUILD_DIR/"
cp -r "$ROOT_DIR/js" "$BUILD_DIR/"
cp -r "$ROOT_DIR/css" "$BUILD_DIR/"
cp -r "$ROOT_DIR/data" "$BUILD_DIR/"
cp -r "$ROOT_DIR/images" "$BUILD_DIR/"
cp -r "$ROOT_DIR/icons" "$BUILD_DIR/"

# Optional: create a simple version marker
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "Built: $DATE" > "$BUILD_DIR/BUILD.txt"

# Verify
FILE_COUNT=$(find "$BUILD_DIR" -type f | wc -l)
echo "   ✅ Copied $FILE_COUNT files"

# Create zip if requested
if [ "$ZIP" = true ]; then
    cd "$(dirname "$BUILD_DIR")"
    ZIP_NAME="$(basename "$BUILD_DIR").zip"
    rm -f "$ZIP_NAME"
    zip -rq "$ZIP_NAME" "$(basename "$BUILD_DIR")"
    echo "   ✅ Created $ZIP_NAME ($(du -h "$ZIP_NAME" | cut -f1))"
fi

echo ""
echo "🚀 Deployment package ready!"
echo ""
echo "   Upload options:"
echo "      • Netlify:   Drag $BUILD_DIR into app.netlify.com"
echo "      • GitHub:    Push $BUILD_DIR contents to gh-pages branch"
echo "      • FTP:       Upload $BUILD_DIR contents to your server"
echo "      • Share:     Send ${BUILD_DIR}.zip"
echo ""

# Publish the built dist/ to the gh-pages branch via git subtree.
# Must run from the git repo root so the --prefix path resolves.
echo "🌐 Publishing standalone/dist to gh-pages..."
cd "$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
git add . && git commit -m "go live" && git subtree push --prefix standalone/dist origin gh-pages
