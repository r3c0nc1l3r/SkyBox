---
type: synthesis
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# SkyBox Ecosystem Compatibility Roadmap

## Overview

The SkyBox project ([[entities/matchbox]]) has a **strong low-level foundation** — the VM, BIF registration, [[concepts/async-callout-bridge]], Durable Object integration, and WASM build pipeline are all well-implemented. However, the project is **not compatible with the broader [[entities/ortus-solutions]] ecosystem** ([[entities/coldbox]], [[entities/wirebox]], [[entities/cfml]]) due to fundamental architectural differences.

## Three Major Gap Areas

### 1. No ColdBox Support — 🔴 Critical

MatchBox cannot run ColdBox applications because it lacks **seven major components**:
- ColdBox Dispatcher (request lifecycle controller)
- WireBox DI (dependency injection)
- Interceptor Chain (event hooks)
- Request Context (RC/PRC scopes)
- SES URL Router (/handler/action routing)
- View Renderer (layouts and views)
- ColdBox Module System (ModuleConfig.cfc composition)

### 2. No Legacy CFML Support — 🔴 Critical

MatchBox cannot run any `.cfc`/`.cfm` files because:
- The MatchBox parser only handles `.bx`/`.bxs` syntax — no CFML parser exists in Rust
- The JVM CFML transpiler (Java/ANTLR) cannot run on WASM
- The `bx-compat-cfml` runtime shims are JVM-interceptor-based
- JNI is disabled, blocking `createObject("java", ...)`

### 3. Compile-Time-Only Architecture — 🔴 High

The [[concepts/compile-time-module-system]] is the most consequential architectural constraint:
- All BIFs and modules selected at compile time — no runtime discovery
- No dynamic BIF registration API from BoxLang code
- No interceptor/event system for extension hooks
- [[concepts/native-fusion]] links Rust crates but only at compile time

## Priority Recommendations

| Priority | Area | Effort | Why |
|----------|------|--------|-----|
| 🥇 P1 | **Dynamic extension system** (BIF registration, module discovery, events) | Medium | Enables all other ecosystem features |
| 🥇 P1 | **CFML parser** in Rust | Very Large | Unlocks migration of legacy apps |
| 🥈 P2 | **WireBox Lite** (DI container) | Large | Needed for ColdBox + modules |
| 🥈 P2 | **Runtime behavior shims** (null handling, coercion) | Large | Required for CFML compat |
| 🥉 P3 | **ColdBox Dispatcher** + Interceptor Chain | Very Large | Full HMVC support |
| 🥉 P3 | **SES Router** + View Rendering | Large | Completes ColdBox support |

## Key Insight

> "The compile-time-only module system is the biggest architectural constraint — ColdBox and standard BoxLang modules depend on runtime discovery and loading. Changing this would be a fundamental architectural shift."

## Update: MatchBox feature/jit Changes the Picture

Since this analysis, the submodule has been updated and the `origin/feature/jit` branch has been examined (250+ commits ahead). Several gaps are now addressable:

| Gap | Status | feature/jit Impact |
|-----|--------|--------------------|
| Compile-time module system | 🟡 Mitigated | feature/jit adds `matchbox.toml` discovery, `--module` CLI, `ModuleInfo` struct — dynamic module loading |
| BIF registration | 🟡 Mitigated | Native Fusion supports Rust BIF registration + dynamic imports (`d9f9d0d`, `1ee0b05`) |
| Lambda support | ✅ Solved | `df3eb49` adds lambda closures |
| Built-in BIFs | ✅ Solved | File system, HTTP, JSON, crypto, math, UUID, CLI BIFs now built-in |
| Async model | 🔴 Changed | feature/jit removes NativeFutureHandle/channels in favor of simpler BxFuture model. SkyBox callout bridge needs re-implementation |
| web_time patch | 🔴 Still needed | feature/jit has web-time dep but doesn't use it for Instant |
| ColdBox/WireBox/CacheBox | 🔴 Unchanged | Still need full framework shims — feature/jit doesn't add DI or interceptors |
| CFML parser | 🔴 Unchanged | Still need a Rust-based CFML transpiler |

### Key Takeaway

The `feature/jit` branch removes the need for our `async_waiting` vendor patch (different dispatch model) and our custom BIF implementations (built-ins available). But the `web_time` patch still applies, and the callout bridge needs a full re-implementation for the BxFuture-based async model.

## Recommended Hybrid Strategy

Rather than trying to port everything at once, a **hybrid approach** is most practical:
- **For CFML**: Pre-compile `.cfc`/`.cfm` files to `.bxs` during the build phase (avoids runtime parser dependency)
- **For modules**: Keep compile-time BIF resolution but add runtime service discovery on top
- **For DI**: Build a lightweight WireBox-compatible container in pure BoxLang first (no Rust needed)

## Related

- [[sources/SRC-2026-05-26-001]]
- [[entities/matchbox]]
- [[entities/coldbox]]
- [[entities/cfml]]
- [[concepts/compile-time-module-system]]
- [[concepts/cfml-compatibility]]
- [[concepts/wirebox-di-container]]
