---
type: source
title: "feature/jit migration needs 6 new BxVM trait methods"
slug: feature-jit-bxvm-trait-methods-needed
status: insight
created: 2026-05-26
updated: 2026-05-26
category: architecture
---
# feature/jit migration needs 6 new BxVM trait methods
Porting [[entities/matchbox]] from `vendor-patches` to `feature/jit` requires adding 6 methods to the `BxVM` trait that were removed: `future_new()`, `set_async_waiting()`, `future_schedule_resolve()`, `is_string_value()`, `is_bytes()`, `is_array_value()`, `is_struct_value()`, `to_bytes()`. These are used by the callout bridge (bifs.rs), channel serialization (channel.rs), and DO adapter (do_adapter.rs). The feature/jit branch's BxFuture GC model replaces the old NativeFutureHandle + mpsc channel approach, so these methods need re-implementing using `heap.alloc(GcObject::Future(...))` and `FutureStatus` instead. Also needed: `call_method` trait parameter fix, and web_time one-line import change.
*Category: architecture*
---
*Captured: 2026-05-26*
## Related
_Add links to related pages._