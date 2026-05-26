---
type: concept
domain: engineering
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# Compile-time Module System

MatchBox's module and BIF registration system operates entirely at **compile time**, in contrast to JVM [[entities/boxlang]]'s dynamic runtime module discovery.

## How It Works

Modules are discovered and loaded from these sources (in priority order):
1. `box.json` dependencies — CommandBox-style package manifest
2. `matchbox.toml` modules — Toml manifest with explicit path entries
3. `modules/` or `boxlang_modules/` directories — Folder scan for `ModuleConfig.bx`
4. `--module <path>` CLI flag — Override with same-name replacement

Each `ModuleConfig.bx` is parsed and compiled in an isolated VM at **compile time**:
1. `onLoad()` is called
2. `configure()` returns a settings struct
3. BIF sources from `bifs/*.bxs` are injected as prelude sources (tree-shaked into final binary)
4. `getModuleSettings(name)` is auto-generated with baked-in settings
5. Native Rust modules (via [[concepts/native-fusion]]) are compiled alongside the VM

## Key Limitation

No runtime module discovery or dynamic BIF registration. All extensions must be selected and compiled into the final WASM binary at build time. This blocks:
- ColdBox module loading at startup
- Dynamic plugin systems
- Any post-deployment extension

## Related

- [[concepts/bif-registration-rust-based]]
- [[concepts/native-fusion]]
- [[entities/matchbox]]
- [[entities/coldbox]] — Relies on runtime module discovery
