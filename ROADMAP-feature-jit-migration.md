# Roadmap: MatchBox feature/jit Migration + ColdBox Ecosystem Support

> **Scope**: Port SkyBox's `matchbox-cf-worker` and ecosystem from `vendor-patches` (v0.6.x) to `feature/jit` (v0.3.0+JIT), then build toward ColdBox/WireBox compatibility.
> **Status**: Submodule switched to `feature/jit` at commit `9b48498`. 33 compilation errors to resolve.
> **Fork**: `teamr3c0nc1l3r/matchbox` — `feature/jit` branch.

---

## Phase 0: Understand What feature/jit Changes

The JIT branch (157 commits ahead of master) is not an incremental update — it replaces the architecture our patches targeted:

| Area | vendor-patches (current) | feature/jit (target) |
|------|--------------------------|----------------------|
| **Async model** | `NativeFutureHandle` + mpsc channels + `async_waiting` | `BxFuture` GC objects + `FutureStatus` enum |
| **Dispatch** | `call_method_value()` function | Inline dispatch via `BxNativeObject::call_method()` |
| **Fiber scheduler** | `pump_until_blocked()` + `run_fiber()` | Simplified `run_all()` with priority scheduling |
| **Function repr** | Nested chunks | Flat function representation |
| **JIT** | None | Cranelift JIT with type guards, deopt, OSR |
| **Modules** | Compile-time only | Dynamic: `matchbox.toml`, `--module`, Native Fusion |
| **Built-in BIFs** | ~70 core | +FS, HTTP, JSON, crypto, UUID, math, CLI |
| **Control flow** | if/else, for | +while, switch/break, Elvis, ternary |
| **Lambdas** | ❌ | ✅ |
| **Interop** | `wasm-bindgen` only | `wasm-bindgen` + `js-host-abi` (WASI ABI) |
| **web_time** | Patched (Instant fix) | Dep exists, not imported — 1-line fix still needed |
| **Crate count** | 10 crates | 5 crates (simplified — no server/tui/utility) |

### Dependency Changes That Affect Us

Our `matchbox-cf-worker` crate depends on:
- `matchbox_vm` — ✅ Exists in feature/jit (same path, same basic API)
- `matchbox_compiler` — ✅ Exists in feature/jit

But the internal APIs have changed significantly.

---

## Phase 1: Port matchbox-cf-worker to feature/jit API

**33 compilation errors** catalogued. Fix order matters — some unlocks cascade.

### 1a. BxVM Trait: Add Missing Methods to feature/jit Fork (5 errors)

The `BxVM` trait in feature/jit lacks methods our BIFs depend on. We add them to the fork's `feature/jit` branch:

**Need to add to `crates/matchbox-vm/src/types/mod.rs` (BxVM trait):**

```rust
// Async future creation — needed by all sending BIFs
fn future_new(&mut self) -> BxValue;

// Set the current fiber to wait for async completion
fn set_async_waiting(&mut self, async_id: u64);

// Schedule a future for completion with a value
fn future_schedule_resolve(&mut self, future: BxValue, value: BxValue) -> Result<(), String>;

// Type inspection helpers
fn is_string_value(&self, val: BxValue) -> bool;
fn is_bytes(&self, val: BxValue) -> bool;
fn is_array_value(&self, val: BxValue) -> bool;
fn is_struct_value(&self, val: BxValue) -> bool;
fn to_bytes(&self, val: BxValue) -> Vec<u8>;
```

**Implement in `crates/matchbox-vm/src/vm/mod.rs`:**
- `future_new()` → `self.heap.alloc(GcObject::Future(BxFuture { ... }))` returning `BxValue::new_ptr(id)`
- `set_async_waiting(id)` → `self.fibers[idx].wait_until = Some(Instant::now() + ...)` to yield + tag the fiber as waiting
- `future_schedule_resolve(f, v)` → find the GC object, set its value + status to `Completed`
- Type helpers → wrap existing internal logic (`to_string_internal`, `heap.get()` checks)

**⚠️ Design decision**: The new BxFuture model doesn't need a separate `async_waiting` field on `BxFiber` — the `FutureStatus` on the heap object is sufficient. `set_async_waiting` can be a yield + mark pattern. The callout bridge will poll `FutureStatus` instead of checking `async_waiting`.

### 1b. Fix `call_method` Trait Mismatch (1 error)

The feature/jit `BxNativeObject::call_method` trait takes 4 params (vm, name, args) but our `CfWebSocketChannelObject::call_method` has 5. Straightforward fix.

### 1c. Fix DoState — Replace Removed VM Methods (8 errors)

| Removed Method | Replacement |
|----------------|-------------|
| `instantiate_global_class_without_constructor` | Instantiate class via `get_global()` + inline method call |
| `set_instance_variables_json` | Manual struct field-by-field set using `struct_set()` |
| `instance_variables_json` | Manual struct field read using `struct_get()` + serde serialization |
| `call_method_value(listener, "method", args)` | `call_function_value(listener, args)` — proper method dispatch in feature/jit |
| `bytes_new(data)` | `string_new(...)` — feature/jit handles binary via JS interop |
| `pump_until_blocked()` | `run_all()` — the main execution loop in feature/jit |

**Key insight**: `call_method_value` → `call_function_value` works because in feature/jit, method dispatch is handled by `execute_invoke()` in the VM's main loop — the function value already carries the method context. This may change how we construct the call site.

### 1d. Fix channel.rs — Replace Type Inspection Helpers (4 errors)

Replace `vm.is_string_value(v)`, `vm.is_bytes(v)`, `vm.is_array_value(v)`, `vm.is_struct_value(v)` and `vm.to_bytes(v)` with direct heap inspection:

```rust
// In feature/jit, access via value's GC pointer:
if let Some(id) = val.as_gc_id() {
    match vm.heap.get(id) {  // need &VM ref, not &dyn BxVM
        GcObject::String(s) => { /* ... */ }
        GcObject::Array(a) => { /* ... */ }
        // ...
    }
}
```

**Challenge**: `channel.rs` functions use `&dyn BxVM` which doesn't expose `heap`. May need to:
- Change channel API to accept `&VM` directly, or
- Add the type-check methods to BxVM trait (see 1a)

### 1e. Fix BIF Registration — `send_binding_callout` Async Flow (5 errors)

The core async pattern changes:

**Current** (vendor-patches):
```rust
fn send_binding_callout(...) {
    let future = vm.future_new();                    // BxVM trait method
    ASYNC_FUTURES.insert(id, future);                 // thread-local
    vm.set_async_waiting(id);                         // tag current fiber
    // ... JS callout via bridge
    Ok(future)
}
```

**Target** (feature/jit):
```rust
fn send_binding_callout(...) {
    let future = vm.future_new();                     // NEW: BxVM trait method (add in 1a)
    let future_value = future;
    ASYNC_FUTURES.insert(id, future_value);            // thread-local
    vm.set_async_waiting(id);                         // NEW: yield + mark fiber
    // ... JS callout via bridge
    Ok(future) // BoxLang code will poll via FutureStatus
}
```

**Changed**: When JS resolves the async, `resolve_async_future` runs:
```rust
// vendor-patches:
vm.future_schedule_resolve(future, bx_val)?;

// feature/jit target:
// Set the BxFuture's status to Completed and value directly on the heap:
if let Some(future_id) = future_value.as_gc_id() {
    if let GcObject::Future(f) = vm.heap.get_mut(future_id) {
        f.status = FutureStatus::Completed;
        f.value = bx_val;
    }
}
```

**This requires `resolve_async_future` to have mutable access to the VM heap.** The current design uses thread-locals (`ASYNC_FUTURES`) and calls `vm.future_schedule_resolve()`. In feature/jit, we must access the heap directly. Options:
1. Pass `&mut dyn BxVM` to `resolve_async_future` and add a method on BxVM trait
2. Use direct VM access in the DO adapter + channel

**Recommendation**: Add `fn set_future_value(&mut self, future: BxValue, value: BxValue)` to BxVM trait.

### 1f. web_time Patch (1-line)

`feature/jit` has `web-time` as a Cargo dependency but `vm/mod.rs` still imports `std::time::Instant`. Same issue as master. Fix:
```rust
// Change:
use std::time::{Instant, Duration};
// To:
use web_time::{Instant, Duration};
```

This is baked into the fork's feature/jit branch.

### 1g. Verify Module Build

Once compilation errors are resolved:
```bash
cd /home/k/Git/SkyBox
cargo check -p matchbox-cf-worker --features js
cargo check -p cf-worker-builder
```

**Expected total effort**: 1-2 days of Rust refactoring.

---

## Phase 2: Port RAG Pipeline (mx-ai package)

The `packages/mx-ai/` module is BoxLang source (`.bx` files) and should work unchanged. But the backing BIFs (`mxaiEmbed`, `mxaiVectorizeUpsert/Query/DeleteByIds`) all use the async callout bridge pattern that's changing in Phase 1.

Once Phase 1a/1d/1e are done, the BIFs just need recompilation:
- `mxaiEmbed` → `send_binding_callout("AI", "embed", ...)` ✅
- `mxaiVectorizeUpsert` → `send_binding_callout("Vectorize", "vectorize_upsert", ...)` ✅
- `mxaiVectorizeQuery` → `send_binding_callout("Vectorize", "vectorize_query", ...)` ✅
- `mxaiVectorizeDeleteByIds` → `send_binding_callout("Vectorize", "vectorize_delete_by_ids", ...)` ✅

**Effort**: Minimal if Phase 1 is done well (the BIF body is the same pattern, just the underlying async helper changes).

---

## Phase 3: Leverage New feature/jit Capabilities

Once ported, these new capabilities become available:

### 3a. Native Fusion for Rust BIF Registration

`feature/jit` has proper Native Fusion support (`1ee0b05`, `d9f9d0d`). Our `bifs.rs` can be refactored from:
```rust
// Current: manual HashMap insertion
vm.insert_global("d1query", BxValue::new_ptr(heap.alloc(GcObject::NativeFunction(d1_query_bif))));
```

Into proper Native Fusion module registration with `matchbox.toml` metadata. This is cleaner and aligns with BoxLang module conventions.

### 3b. Built-in BIFs Replace Custom Implementations

`feature/jit` has built-in:
- `hash` (crypto) — replace our custom `hash` user-defined function
- `http` — could replace manual fetch patterns
- `UUID` — replace `createUUID()` calls
- `jsonDeserialize`/`jsonSerialize` — already exist but may be more complete

### 3c. Dynamic Module System

The compile-time module system was a major limitation for ecosystem compatibility. `feature/jit` adds:
- `matchbox.toml` module discovery
- `--module <path>` CLI flag
- Runtime BIF registration via Native Fusion

This directly addresses the **P1** recommendation from the ecosystem gap analysis.

### 3d. JIT Compilation (Cranelift)

Hot function compilation with type guards and deopt. Best for:
- ColdBox request dispatch loops
- RAG query processing pipelines
- Long-lived DO instances handling many requests

---

## Phase 4: Extension Architecture (Pre-ColdBox Foundation)

Before ColdBox can run, we need an extension/plugin architecture. feature/jit gives us half the tools; we build the other half.

### 4a. Dynamic BIF Registration API (BoxLang-side)

Add a `registerBIF(name, function)` BIF callable from BoxLang code. This enables:
- Module loading at Worker startup (not compile time)
- Plugin systems
- Runtime extensibility

Implementation: Requires adding a method to the VM that inserts into the BIF HashMap, exposed via the BxVM trait.

### 4b. Interceptor/Event Model

The biggest missing piece for ColdBox compatibility. Needs:
- Event registration (add/remove listeners)
- Event broadcasting (ordered execution)
- Lifecycle hooks: `beforeBIFInvocation`, `afterBIFInvocation`, `onModuleLoad`, `onModuleUnload`, `beforeRequest`, `afterRequest`

Implementation path:
1. Pure-BoxLang implementation first (event bus using arrays of closures)
2. Rust-native implementation later for performance

### 4c. Service Registry (Pre-WireBox)

A lightweight `getInstance()` / `inject` model:
- Map service names to factory closures
- Singleton vs prototype scoping
- `@inject` annotation processing on class properties

Implementation: Pure BoxLang class or Rust struct.

### 4d. CFML Parser (Long-term)

The CFML transpiler is the hardest dependency. Strategy:
1. Pre-compile `.cfc` → `.bxs` during build phase (avoid runtime parser)
2. Only implement the transpiler when there's a concrete migration need
3. Consider a Rust port of the ANTLR grammar if/when needed

---

## Phase 5: ColdBox Dispatcher (The Big One)

Once the extension architecture is in place, build ColdBox compatibility component-by-component:

### 5a. WireBox Lite (DI Container) — P2

A WireBox-compatible DI container in pure BoxLang:
- `map("alias").to("path")` Binder DSL
- `property name="x" inject="id:alias"` annotation processing
- Singleton/prototype/request scope management
- `getInstance()` BIF

This is the **prerequisite** for ColdBox — almost every ColdBox component depends on WireBox injection.

### 5b. Request Context (RC/PRC) — P3

Request/private collections modeled as BoxLang structs with scoping rules matching ColdBox conventions.

### 5c. SES URL Router — P3

Route `/handler/action/param1` patterns with named route support. Can leverage Durable Object's `matched_route` and `route_params` for Workers-side routing.

### 5d. View Renderer — P3

Convention-based view/layout rendering. ColdBox convention: `views/handler/action.cfm`. Would need:
- Template resolution from DO storage or static assets
- `event.renderView()` implementation
- Layout wrapping

### 5e. Full ColdBox Controller Shim — P4

The `coldbox.system.web.Controller.processRequest()` lifecycle. This is the largest single component — coordinate dispatcher, interceptors, router, view renderer, and request context.

### 5f. Module System (ColdBox-style) — P4

`ModuleConfig.cfc` with handlers, interceptors, models, views, routes — the ColdBox module convention. Different from feature/jit's `ModuleConfig.bx`.

---

## Phase 6: Ecosystem Verification + Testing

### 6a. CI for feature/jit on fork

Set up GitHub Actions to:
- Build all SkyBox crates against feature/jit
- Run BoxLang test suite subset (pure-BoxLang tests only)
- Run WebSocket chat demo E2E test
- Run RAG pipeline integration test

### 6b. Performance Benchmarks

With Cranelift JIT available:
- Cold start latency (DO initialization)
- Hot-path throughput (request handling)
- Memory footprint comparison
- WASM binary size

### 6c. Port Existing Demos

- `examples/chatroom/` — WebSocket chat
- `examples/skychat/` — AI chat with RAG
- `examples/moonphase/` — Simple demo
- `examples/todo/` — CRUD with D1

All should work once Phases 1-2 are complete.

---

## Dependency Graph (Critical Path)

```
Phase 0 (Understand)
    │
    ▼
Phase 1a (Add BxVM trait methods in fork) ──────┐
    │                                             │
    ▼                                             │
Phase 1b-1e (Fix cf-worker for new APIs) ────────┤
    │                                             │
    ▼                                             ▼
Phase 1f (web_time patch)           Phase 2 (RAG port)
    │                                             │
    └──────────┬──────────────────────────────────┘
               ▼
          Phase 3 (Leverage new capabilities)
               │
               ▼
          Phase 4 (Extension architecture)
               │
               ├── 4a: Dynamic BIF registration
               ├── 4b: Interceptor/event model
               ├── 4c: Service registry
               └── 4d: CFML parser (long-term)
               │
               ▼
          Phase 5 (ColdBox components)
               │
               ├── 5a: WireBox Lite (DI)
               ├── 5b: Request Context
               ├── 5c: SES Router
               ├── 5d: View Renderer
               ├── 5e: Full ColdBox Controller
               └── 5f: ColdBox Module System
               │
               ▼
          Phase 6 (Testing + Verification)
```

---

## Immediate Next Steps (What to Do Now)

1. **Add BxVM trait methods to fork's feature/jit branch** — the 6 methods listed in Phase 1a. This unblocks everything.
2. **Apply web_time patch** — one-line fix in fork's feature/jit.
3. **Fix call_method trait** — adjust `CfWebSocketChannelObject` signature.
4. **Refactor DoState** — replace removed VM methods with feature/jit equivalents.
5. **Refactor channel.rs** — add type-check helpers to BxVM trait or refactor to use direct heap access.
6. **Rewrite send_binding_callout** — use new BxFuture-based async pattern.
7. **Build and test** — verify chatroom and RAG demos work.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `feature/jit` has a different `BxNativeFunction` signature than expected | BIF compilation fails | Wrap BIFs in adapter layer |
| BxFuture GC model has different lifetime semantics | Async results lost or GC'd before consumed | Pin futures in `ASYNC_FUTURES` thread-local until resolved |
| `run_all()` blocks instead of yielding for async | No way to return control to JS between async ops | Check if `run_all()` can be called incrementally or if we need a different dispatch model |
| `call_function_value` doesn't work the same as `call_method_value` | Method calls fail | Test with a simple BoxLang listener class first |
| JIT feature flag adds build complexity | CI fails | Gate JIT behind a feature flag, default off for `cf-worker` target |
| feature/jit lacks WASM-specific optimizations | Binary size increases | Compare before/after, optimize with `--strip-source` flag |
| Fork diverges from upstream | Merge conflicts later | Keep fork changes minimal — only add BxVM trait methods + web_time |

---

## References

- Wiki: `entities/matchbox` — Architecture, branch evolution, migration path
- Wiki: `syntheses/skybox-ecosystem-compatibility-roadmap` — Gap analysis and priority recommendations
- Wiki: `sources/matchbox-feature-jit-supersedes-vendor-patches` — Detailed analysis of JIT branch differences
- Wiki: `concepts/async-callout-bridge` — Callout bridge protocol and async model comparison
- Code: `vendor/matchbox` — Now on feature/jit branch
- Code: `crates/matchbox-cf-worker/` — Target for Phase 1 refactoring
- Code: `packages/mx-ai/` — RAG pipeline (Phase 2)
