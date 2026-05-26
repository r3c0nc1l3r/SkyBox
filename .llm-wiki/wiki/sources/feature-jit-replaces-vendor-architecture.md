---
type: source
title: "feature/jit replaces dispatch architecture, not just patches"
slug: feature-jit-replaces-vendor-architecture
status: insight
created: 2026-05-26
updated: 2026-05-26
category: architecture
---
# feature/jit replaces dispatch architecture, not just patches
The [[entities/matchbox]] `feature/jit` branch (157 commits, Cranelift JIT, lambdas, flat functions) doesn't just supersede SkyBox's vendor patches — it replaces the entire dispatch architecture they patched against. There's no `call_method_value()` function (method dispatch is inline), no `NativeFutureHandle` (replaced by GC-allocated BxFuture with Pending/Completed/Failed status), and no `pump_until_blocked()` (simplified `run_all()` with priority scheduling). The `web_time` patch still applies (the dep exists but isn't imported). All 33 compilation errors in `matchbox-cf-worker` stem from these architectural changes, not from missing features.
*Category: architecture*
---
*Captured: 2026-05-26*
## Related
_Add links to related pages._