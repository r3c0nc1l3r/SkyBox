---
type: source
title: "MatchBox feature/jit branch supersedes vendor patches differently than expected"
slug: matchbox-feature-jit-supersedes-vendor-patches
status: insight
created: 2026-05-26
updated: 2026-05-26
category: architecture
---
# MatchBox feature/jit branch supersedes vendor patches differently than expected
The `origin/feature/jit` branch of [[entities/matchbox]] (250+ commits) does NOT directly incorporate either of SkyBox's vendor patches, but for different reasons:

1. **web_time::Instant**: `feature/jit` has `web-time` as a Cargo dependency but `vm/mod.rs` still imports `std::time::{Instant, Duration}` — same issue as origin/master. The patch is still needed, but the dependency is already there, so it's a one-line import change.

2. **async_waiting patch (call_method_value tight-loop)**: `feature/jit` replaces the entire dispatch architecture — there's no `call_method_value()` function at all. Method dispatch is inline in the main loop via `BxNativeObject::call_method()`. The `BxFiber` struct is simpler (no `async_waiting` field, no `NativeFutureHandle`, no mpsc channels). Async is handled via `BxFuture` heap-allocated GC objects with `Pending`/`Completed`/`Failed` status.

Bottom line: `feature/jit` doesn't just integrate our patches — it replaces the architecture they patch against. The callout bridge ([[concepts/async-callout-bridge]]) will need re-implementation for the BxFuture model. No patches to remove — the old architecture is gone.

*Category: architecture*
---
*Captured: 2026-05-26*
## Related
_Add links to related pages._