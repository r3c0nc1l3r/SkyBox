---
name: matchbox-patches
description: Manage deterministic vendor patches for the matchbox submodule in SkyBox. Use when applying, reverting, creating, or troubleshooting patches to vendor/matchbox/ without forking the upstream repo.
license: MIT
compatibility: opencode
metadata:
  project: SkyBox
  workflow: vendor-patches
---

# MatchBox Vendor Patches

SkyBox patches the `vendor/matchbox` submodule deterministically via patch files instead of forking the upstream repo.

## How It Works

```
patches/matchbox/*.patch  →  scripts/apply-patches.sh  →  vendor/matchbox/
```

The build pipeline (`build-multi.sh`) applies patches before compilation and reverts them after, leaving the submodule clean.

## Quick Reference

```bash
# List existing patches
ls patches/matchbox/*.patch

# Create a new patch (after making changes in vendor/matchbox/)
cd vendor/matchbox
git diff > ../../patches/matchbox/0002-my-change.patch

# Or from a staged/committed change:
git format-patch -1 HEAD --stdout > ../../patches/matchbox/0002-my-change.patch

# Apply patches manually
bash scripts/apply-patches.sh

# Revert patches
bash scripts/apply-patches.sh --revert
```

## Naming Convention

Patches are prefixed with a zero-padded sequence number:

```
0000-use-web-time-for-wasm32.patch        # Ordering fix
0001-add-async-waiting-support.patch      # Feature patch
0002-descriptive-name.patch               # Next patch
```

They apply in sorted order. Use `git format-patch` or `git diff` output (unified diff format with `a/` and `b/` prefixes).

## Patch Strip Level

`apply-patches.sh` auto-detects the correct `-p` strip level:
- `-p1`: paths like `crates/matchbox-vm/src/vm/mod.rs` (most common)
- `-p2`: paths like `vendor/matchbox/crates/matchbox-vm/src/vm/mod.rs`

If a patch fails, check the first file path in the diff and verify it matches the structure under `vendor/matchbox/`.

## Current Patches

| Patch | Description | Files Changed |
|-------|-------------|---------------|
| `0000-use-web-time-for-wasm32.patch` | Replace `std::time::Instant` with `web_time::Instant` for wasm32 compilation | `crates/matchbox-vm/src/vm/mod.rs` |
| `0001-add-async-waiting-support.patch` | Add `set_async_waiting(u64)` to BxVM trait + async fiber support in `call_method_value` | 3 files in `crates/matchbox-vm/src/` |

## Build Integration

Patches are applied in `build-multi.sh` as step 1, reverted as the final step:

```bash
# Apply → Build → Revert
[1/6] bash scripts/apply-patches.sh          # Apply patches to vendor/
[2/6] ... build steps ...
[6/6] bash scripts/apply-patches.sh --revert  # Revert, submodule stays clean
```

If the build fails mid-way, the patches remain applied. Run `bash scripts/apply-patches.sh --revert` manually to clean up.

## Troubleshooting

- **Patch rejected**: The submodule likely has uncommitted changes. Run `cd vendor/matchbox && git checkout -- .` to clean it, then retry.
- **Already applied / double revert**: `git apply -R` on a clean submodule is harmless — the script uses `|| true` for reverts.
- **Patch doesn't apply cleanly**: Run `git apply --check -p1 patches/matchbox/<file>.patch` from the repo root to see the error. Check strip level.
- **Submodule dirty after build**: Run `bash scripts/apply-patches.sh --revert` manually, or `cd vendor/matchbox && git checkout -- .`
