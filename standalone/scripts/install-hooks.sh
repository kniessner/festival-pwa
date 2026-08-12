#!/usr/bin/env bash
# ── Install the repo's git hooks ────────────────────────────────────
# Symlinks scripts/hooks/* into .git/hooks/ so they run automatically.
# Idempotent: safe to run multiple times.
#
# Why symlink and not copy: any edit to scripts/hooks/pre-commit
# instantly applies to every dev's clone that ran this once.  If you
# copy, you'd have to re-run install after each hook change.
#
# Usage: `npm run install:hooks` (recommended) or `bash scripts/install-hooks.sh`.
set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_SRC="$REPO_ROOT/standalone/scripts/hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

if [[ ! -d "$HOOKS_SRC" ]]; then
    echo "✖ No hooks directory at $HOOKS_SRC — nothing to install."
    exit 1
fi

if [[ ! -d "$HOOKS_DST" ]]; then
    echo "✖ Not a git checkout (no $HOOKS_DST) — nothing to install."
    exit 1
fi

INSTALLED=0
for src in "$HOOKS_SRC"/*; do
    name="$(basename "$src")"
    dst="$HOOKS_DST/$name"
    # Make source executable in case we forgot
    chmod +x "$src"
    # Overwrite whatever's there — hooks aren't tracked so we own the destination
    ln -sfn "$src" "$dst"
    echo "✓ installed hook: $name -> $src"
    INSTALLED=$((INSTALLED + 1))
done

echo
echo "Installed $INSTALLED hook(s).  Try \`git commit\` to see them in action."
echo "Bypass in emergencies with \`git commit --no-verify\` (use sparingly)."
