---
type: synthesis
updated: 2026-05-26
sources: 
  - sources/SRC-2026-05-26-001
  - sources/feature-jit-bxvm-trait-methods-needed
  - sources/feature-jit-replaces-vendor-architecture
  - sources/coldbox-on-matchbox-hybrid-strategy
---

# SkyBox Ecosystem Compatibility Roadmap

## Overview

The SkyBox project ([[entities/matchbox]]) has a **strong low-level foundation** — the VM, BIF registration, [[concepts/async-callout-bridge]], Durable Object integration, and WASM build pipeline are all well-implemented. However, the project has been **not compatible with the broader [[entities/ortus-solutions]] ecosystem** ([[entities/coldbox]], [[entities/wirebox]], [[entities/cfml]]) due to fundamental architectural differences.

**Update 2026-05-26**: The MatchBox submodule has been switched from the fork's `vendor-patches` branch to the fork's `feature/jit` branch (aligned with upstream `origin/feature/jit`). This changes the migration picture significantly.

## Status of Switch to feature/jit

- **Submodule**: Now at `9b48498` on `fork/feature/jit` (identical to `origin/feature/jit`)
- **Build status**: 33 compilation errors in `matchbox-cf-worker` crate
- **Root cause**: feature/jit replaces the entire dispatch/async architecture our vendor patches targeted
- **Phase 1 roadmap**: `ROADMAP-feature-jit-migration.md` in project root

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

### 3. Compile-Time-Only Architecture — 🟡 Partially Mitigated

The [[concepts/compile-time-module-system]] was the most consequential architectural constraint. `feature/jit` partially addresses this with:
- Dynamic module loading via `matchbox.toml` and `--module` CLI
- Native Fusion for Rust BIF registration at module load time
- But still no interceptor/event system or dynamic BIF registration from BoxLang

## Priority Recommendations

| Priority | Area | Effort | Why | feature/jit Impact |
|----------|------|--------|-----|-------------------|
| 🥇 P1 | **Port cf-worker to feature/jit API** (BxFuture, BxVM trait, callout bridge) | Medium | Unblocks everything else | Required — 33 compilation errors |
| 🥇 P1 | **Dynamic BIF registration API** | Medium | Enables all other ecosystem features | Partially solved (Native Fusion) |
| 🥇 P1 | **CFML parser** in Rust | Very Large | Unlocks migration of legacy apps | Unchanged — no parser in feature/jit |
| 🥈 P2 | **WireBox Lite** (DI container) | Large | Needed for ColdBox + modules | Unchanged — feature/jit doesn't add DI |
| 🥈 P2 | **Runtime behavior shims** (null handling, coercion) | Large | Required for CFML compat | Unchanged |
| 🥉 P3 | **ColdBox Dispatcher** + Interceptor Chain | Very Large | Full HMVC support | Unchanged |
| 🥉 P3 | **SES Router** + View Rendering | Large | Completes ColdBox support | Unchanged |

## feature/jit Migration — Complete Breakdown

### What feature/jit Changes

The `feature/jit` branch (157 commits ahead of master at 9b48498) is not an incremental update — it replaces the entire dispatch architecture:

| Area | vendor-patches (v0.6.x) | feature/jit |
|------|--------------------------|-------------|
| **Async model** | `NativeFutureHandle` + mpsc channels + `async_waiting` | `BxFuture` GC heap objects + `FutureStatus` enum |
| **Dispatch** | `call_method_value()` function | Inline dispatch via `BxNativeObject::call_method()` in main loop |
| **Fiber scheduler** | `pump_until_blocked()` + `run_fiber()` | Simplified `run_all()` with priority scheduling + timeslice |
| **Function repr** | Nested chunks | Flat function representation |
| **JIT** | None | Cranelift JIT with type guards, deopt, OSR |
| **Module system** | Compile-time only | Dynamic: `matchbox.toml`, `--module`, Native Fusion |
| **Built-in BIFs** | ~70 core | +FS, HTTP, JSON, crypto, UUID, math, CLI |
| **Control flow** | if/else, for | +while, switch/break, Elvis, ternary, lambdas |
| **web_time** | Manually patched | Web-time dep present but not imported — 1-line fix |
| **Crates** | 10 crates (incl. server, tui, utility) | 5 crates (simplified) |
| **Garbage collector** | Simple mark-sweep | Generational GC |

### What Needs to Change (33 Errors Categorized)

**Error category breakdown:**
1. **BxVM trait methods missing** (9 errors): `future_new`, `set_async_waiting`, `future_schedule_resolve`, `to_bytes`, `is_string_value`, `is_bytes`, `is_array_value`, `is_struct_value` — used by BIFs and channel serialization
2. **DO adapter methods missing** (8 errors): `instantiate_global_class_without_constructor`, `set_instance_variables_json`, `instance_variables_json`, `call_method_value`, `bytes_new`, `pump_until_blocked` — used in DoState lifecycle
3. **`call_method` trait signature** (1 error): 5 params vs 4
4. **RAG BIFs** (15 errors): Each BIF calls `future_new` + `set_async_waiting` — trivially fixed once the BxVM trait methods are added

### Fix Strategy (6-Step)

1. **Add 6+ BxVM trait methods to fork's feature/jit** — implement using `heap.alloc(GcObject::Future(...))` and `FutureStatus::Pending`/`Completed`
2. **Fix `call_method` trait** — adjust `CfWebSocketChannelObject` parameter count
3. **Replace DoState removed methods** — use `call_function_value`, inline struct serialization, `run_all()`
4. **Fix channel.rs type helpers** — add to BxVM trait or switch to `&VM`-level access
5. **Rewrite `send_binding_callout`** — use new BxFuture async pattern instead of NativeFutureHandle
6. **Apply web_time patch** — one import change in `vm/mod.rs`

Detailed plan: `ROADMAP-feature-jit-migration.md`

## ColdBox-on-MatchBox Build-Up (6 Layers)

Once the `feature/jit` port is complete, ColdBox compatibility builds up in layers. Most of ColdBox can be implemented in **pure BoxLang** — no Rust needed for the framework itself:

| Layer | Component | Language | Rust Needed? |
|-------|-----------|----------|-------------|
| **1** | Dynamic BIF registration API | Rust (BxVM trait) | ✅ Yes — VM must allow runtime BIF registration |
| **2** | Interceptor/event model | BoxLang | ❌ No — pure event bus with closures |
| **3** | WireBox Lite DI container | BoxLang | ❌ No — service registry + singleton cache |
| **4a** | Request Context (RC/PRC) | BoxLang | ❌ No — structs with conventions |
| **4b** | SES URL Router | BoxLang + Worker routes | ⚠️ Minimal — route config in Worker |
| **5a** | View Renderer | BoxLang | ❌ No — string template rendering |
| **5b** | ColdBox Controller shim | BoxLang + Rust bridge | ⚠️ Just the HTTP dispatch bridge |
| **6** | ColdBox Module System | BoxLang | ❌ No — ModuleConfig.cfc pattern |

### Key Insight

The Rust boundary is very thin for ColdBox support:
- Layer 1 (dynamic BIF reg) is the only hard Rust dependency
- Everything else is BoxLang code that runs on the existing VM
- The ColdBox dispatcher is a BoxLang class hierarchy — `Controller.bx`, `InterceptorChain.bx`, `Router.bx`
- WireBox is already pure BoxLang in its JVM implementation — the port is removing Java dependencies

## Recommended Build Order

### Phase 1: Port to feature/jit (Current)
- [ ] Add BxVM trait methods to fork
- [ ] Fix cf-worker crate compilation
- [ ] Apply web_time patch
- [ ] Verify chatroom demo works
- [ ] Verify RAG pipeline works

### Phase 2: Leverage New Capabilities
- [ ] Replace custom BIFs with feature/jit built-ins (hash, UUID, etc.)
- [ ] Use Native Fusion for cleaner BIF registration
- [ ] Evaluate JIT for hot-path optimization

### Phase 3: Extension Architecture
- [ ] Dynamic BIF registration from BoxLang (Layer 1)
- [ ] Interceptor/event bus in pure BoxLang (Layer 2)
- [ ] Service registry (pre-WireBox)

### Phase 4: WireBox Lite
- [ ] Binder DSL (`map().to()`)
- [ ] Singleton/prototype/request scopes
- [ ] `@inject` annotation processing
- [ ] `getInstance()` BIF

### Phase 5: ColdBox Components
- [ ] Request Context (RC/PRC)
- [ ] SES Router
- [ ] View Renderer
- [ ] Interceptor Chain (ColdBox-style)
- [ ] ColdBox Controller
- [ ] Module System (ColdBox-style)

### Phase 6: Ecosystem Verification
- [ ] Run ColdBox test suite subset
- [ ] Port cborm/cbsecurity module stubs
- [ ] Benchmarks with JIT enabled
- [ ] CI/CD pipeline

## Related

- [[sources/SRC-2026-05-26-001]] — Original gap analysis
- [[sources/feature-jit-bxvm-trait-methods-needed]] — Detailed trait method requirements
- [[sources/feature-jit-replaces-vendor-architecture]] — Architecture comparison
- [[sources/coldbox-on-matchbox-hybrid-strategy]] — Layer-by-layer ColdBox build-up
- [[entities/matchbox]] — MatchBox entity reference
- [[entities/coldbox]] — ColdBox entity reference
- [[concepts/async-callout-bridge]] — Callout bridge protocol
- [[concepts/wirebox-di-container]] — WireBox architecture
- [[concepts/compile-time-module-system]] — Module system details
