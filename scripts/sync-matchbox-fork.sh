#!/bin/bash
# Sync teamr3c0nc1l3r/matchbox fork with upstream ortus-boxlang/matchbox
# Rebases vendor-patches branch on latest upstream master
set -euo pipefail

FORK_DIR="$(cd "$(dirname "$0")/../vendor/matchbox" && pwd)"
cd "$FORK_DIR"

# Fetch both remotes
echo "→ Fetching upstream (origin)..."
git fetch origin master 2>&1

echo "→ Fetching fork..."
git fetch fork 2>&1

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "→ Current branch: $CURRENT_BRANCH"

# Rebase vendor-patches on latest upstream master
echo "→ Rebasing vendor-patches on origin/master..."
git checkout vendor-patches 2>/dev/null || git checkout -b vendor-patches origin/master
git rebase origin/master

# If rebase had conflicts, abort and warn
if [ $? -ne 0 ]; then
    echo "❌ CONFLICT: Rebase failed. Resolve conflicts manually, then run:"
    echo "   git rebase --continue"
    echo "   git push --force-with-lease fork vendor-patches"
    exit 1
fi

# Force-push updated vendor-patches to fork
echo "→ Pushing to fork..."
git push --force-with-lease fork vendor-patches

# Return to original branch
git checkout "$CURRENT_BRANCH" 2>/dev/null || true

echo "✅ Fork synced. vendor-patches now at:"
git log --oneline -1 origin/master
echo "   ↓ rebased →"
git log --oneline -1 fork/vendor-patches
