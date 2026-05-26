---
type: concept
domain: engineering
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# Async Callout Bridge

The async callout bridge is the mechanism by which [[entities/matchbox]]'s Rust VM communicates with [[entities/cloudflare-workers]] JavaScript APIs. It replaces the JVM [[entities/boxlang]] pattern of `createObject("java", ...)` with a Rust → JS protocol.

## Protocol Flow

```
BoxLang BIF call → Rust VM → __skybox_binding_call → DO.handleBindingCall() → Cloudflare API → async result → Rust VM resume
```

The Durable Object (`mcf-worker.js`) dispatches binding calls via `handleBindingCall()` which patterns-matches on the binding name and delegates to the appropriate Workers API.

## Cloudflare Bindings Using This Bridge

| BIF | Binding | Cloudflare API |
|-----|---------|----------------|
| `d1Query` / `d1Execute` | D1 | `env.DB.prepare().all()` |
| `tursoQuery` / `tursoExecute` | Turso | LibSQL HTTP client |
| `openRouterChat` | OpenRouter | HTTP fetch to OpenRouter API |
| `mxaiEmbed` | Workers AI | `env.AI.run('@cf/baai/bge-base-en-v1.5', ...)` |
| `mxaiVectorizeUpsert/Query/DeleteByIds` | Vectorize | `env.VECTORIZE.upsert()/query()/deleteByIds()` |

## Key Advantage

The bridge enables async I/O in a WASM context where traditional blocking I/O is not available. The Rust VM yields control, the JavaScript runtime handles the async operation, and the VM resumes with the result.

## Async Model Comparison

The bridge's async model differs across MatchBox branches:

### origin/master (current submodule — 57a5379)
- Uses `NativeFutureHandle` + `NativeFutureMessage` (mpsc channels) for native async operations
- Has `native_future_tx`/`native_future_rx` channels on the VM
- `drain_native_completions()` polls channel at each quantum start
- **Problem**: `call_method_value()` tight-loops `Ok(None) => continue` — busy-waits for async completions
- **SkyBox fix**: Added `async_waiting: Option<u64>` to BxFiber + `set_async_waiting()` to break out of the loop

### origin/feature/jit (new work)
- Uses simpler `BxFuture` heap-allocated GC objects (`Pending`/`Completed`/`Failed` status)
- No `NativeFutureHandle`/channel infrastructure
- Method dispatch is inline in the dispatch loop via `BxNativeObject::call_method()`
- No `call_method_value()` function — different dispatch architecture
- **No `async_waiting` field on BxFiber** — has a different approach to fiber lifecycle

The `feature/jit` branch simplifies the async model but removes the channel-based future infrastructure. SkyBox's callout bridge would need re-implementing on top of `BxFuture` if migrating to `feature/jit`.

## Related

- [[concepts/bif-registration-rust-based]]
- [[entities/matchbox]]
- [[entities/cloudflare-workers]]
