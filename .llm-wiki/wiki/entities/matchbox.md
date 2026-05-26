---
type: entity
category: project
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# MatchBox

MatchBox is the **Rust-based native implementation** of [[entities/boxlang]] that targets WASM (WebAssembly) as its primary compilation target. It is the core runtime of the SkyBox project, enabling BoxLang to run on [[entities/cloudflare-workers]] via [[entities/durable-objects]].

## Architecture

MatchBox consists of:
- **matchbox-compiler** — Parser and compiler for `.bx`/`.bxs` BoxLang source files
- **matchbox-vm** — Core BoxLang VM with ~70+ built-in BIFs compiled into a `HashMap<String, BxNativeFunction>` at VM construction
- **matchbox-cf-worker** — Cloudflare Workers adapter hosting the VM inside a Durable Object with Hibernation WebSocket API

## Key Constraints

- **Compile-time-only module system (origin/master)** — All BIFs and modules selected at compile time. No runtime discovery. **feature/jit adds dynamic module loading**.
- **No interceptor/event model** — Unlike JVM [[entities/boxlang]], MatchBox has no event hooks for extension points.
- **No DI container** — No [[entities/wirebox]]-compatible dependency injection.
- **No CFML parser** — Only `.bx`/`.bxs` syntax is supported. No legacy `.cfc`/`.cfm` file parsing.
- **No JNI** — Java interop is disabled for WASM targets ([[concepts/async-callout-bridge]] replaces it for Cloudflare bindings).

## Submodule Status

- **Current pin**: `origin/master` at `57a5379` (v0.6.x)
- **Future target**: `origin/feature/jit` — 250+ commits ahead with JIT, lambdas, dynamic imports, flat functions
- **Vendor patches needing re-evaluation**:
  - `web_time::Instant` — `origin/master` still uses `std::time::Instant` (panics on wasm32). `feature/jit` has `web-time` as a dep but doesn't import it yet.
  - `async_waiting` — `origin/master` tight-loops on async. `feature/jit` has a different dispatch model and no `async_waiting` field.

## Branch Evolution

### origin/master (v0.6.x)
- NativeFutureHandle + mpsc channel async model
- Tight-loop in call_method_value — SkyBox patches required
- std::time::Instant — SkyBox web_time patch required
- No lambda support
- No JIT
- Nested chunk function representation

### origin/feature/jit (upcoming)
- Simpler BxFuture-based async model (no channels, no NativeFutureHandle)
- Different dispatch architecture — no call_method_value function
- web-time dependency present but unused (same std::time::Instant issue)
- Full Cranelift JIT (type guards, deopt, OSR)
- Lambda support, while/switch/break, Elvis operator
- Dynamic module system (matchbox.toml, CLI --module)
- Native Fusion for Rust BIF registration
- Flat function representation (no nested chunks)
- File system, HTTP, JSON, crypto BIFs built-in

### SkyBox Migration Path
1. Currently on origin/master with vendor patches
2. When feature/jit merges to master: port SkyBox crates to new dispatch/async model
3. Remove vendor patches (replaced by upstream infrastructure)
4. Leverage built-in BIFs (replace custom ones)

## Strengths

- Solid VM core with well-organized BIF registration
- Efficient [[concepts/async-callout-bridge]] for Cloudflare Workers API bindings (D1, Vectorize, AI, Turso)
- [[concepts/native-fusion]] system for compiling Rust crates alongside the VM
- Durable Object integration with Hibernation API for stateful workers

## Related

- [[concepts/compile-time-module-system]]
- [[concepts/async-callout-bridge]]
- [[concepts/bif-registration-rust-based]]
- [[entities/coldbox]] — Cannot currently run on MatchBox
