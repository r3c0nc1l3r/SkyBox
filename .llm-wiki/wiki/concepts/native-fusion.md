---
type: concept
domain: engineering
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# Native Fusion

Native Fusion is MatchBox's system for compiling Rust crates alongside the [[entities/matchbox]] VM and linking them directly into the final binary.

## How It Works

1. Module directories contain a `matchbox/` subdirectory with its own `Cargo.toml`
2. The build system scans all `.rs` files for `pub fn register_bifs()` and `pub fn register_classes()` functions
3. Glue code is auto-generated that calls each registration function
4. The Rust crates are compiled alongside the VM and linked directly

This is the Rust/WASM equivalent of JVM [[entities/boxlang]] native modules but without any runtime discovery — everything is linked at compile time.

## What It Enables

Allows extending the VM with native Rust functionality without modifying the core VM source. Used by the `packages/mx-ai/` module for AI bindings.

## Limitation

Like the rest of the module system, Native Fusion operates at compile time only. There is no equivalent of a "hot-plug" native module.

## Related

- [[concepts/compile-time-module-system]]
- [[concepts/bif-registration-rust-based]]
- [[entities/matchbox]]
