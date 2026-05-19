#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# apply-patches.sh — Apply vendor patches deterministically
#
# Usage: ./scripts/apply-patches.sh [--revert]
#
# Reads patch files from patches/<vendor>/*.patch and applies them
# to the corresponding vendor/<vendor>/ directory.
#
# With --revert, applies patches in reverse order to undo them.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REVERT="${1:-}"

apply_patch() {
    local patch_file="$1"
    local target_dir="$2"
    local action="${3:-apply}"

    if [ ! -f "$patch_file" ]; then
        echo "  [SKIP] Patch not found: $patch_file"
        return
    fi

    local strip_level=1
    # Auto-detect strip level by checking if paths starting from
    # the target directory match.
    local first_file
    first_file=$(head -5 "$patch_file" | grep '^--- a/' | head -1 | sed 's/^--- a\///' || true)
    if [ -n "$first_file" ] && [ -f "$target_dir/$first_file" ]; then
        strip_level=1
    else
        # Try stripping one more level (e.g., crates/matchbox-vm/...)
        first_file=$(echo "$first_file" | cut -d/ -f2-)
        if [ -n "$first_file" ] && [ -f "$target_dir/$first_file" ]; then
            strip_level=2
        fi
    fi

    if [ "$action" = "revert" ]; then
        echo "  [REVERT] $(basename "$patch_file") (strip -p$strip_level)"
        (cd "$target_dir" && git apply -R -p"$strip_level" "$patch_file" 2>/dev/null || true)
    else
        echo "  [APPLY]  $(basename "$patch_file") (strip -p$strip_level)"
        (cd "$target_dir" && git apply -p"$strip_level" "$patch_file" 2>/dev/null || {
            # Check if already applied
            if (cd "$target_dir" && git apply --check -p"$strip_level" "$patch_file" 2>&1 | grep -q "already applied"); then
                echo "  [SKIP]   Already applied: $(basename "$patch_file")"
            else
                echo "  [FAIL]   $(basename "$patch_file") — patch rejected"
                return 1
            fi
        })
    fi
}

echo "=== Vendor Patch Manager ==="

for patch_dir in "$ROOT"/patches/*/; do
    vendor="$(basename "$patch_dir")"
    target="$ROOT/vendor/$vendor"

    if [ ! -d "$target" ]; then
        echo "  [SKIP] No vendor/$vendor directory"
        continue
    fi

    echo "--- $vendor ---"

    # Sort patches by filename for deterministic ordering
    for patch_file in $(ls "$patch_dir"*.patch 2>/dev/null | sort); do
        if [ "$REVERT" = "--revert" ]; then
            apply_patch "$patch_file" "$target" revert
        else
            apply_patch "$patch_file" "$target" apply
        fi
    done
done

echo "=== Done ==="
