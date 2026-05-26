---
type: source
title: "ColdBox on MatchBox requires 6-layer build-up"
slug: coldbox-on-matchbox-hybrid-strategy
status: insight
created: 2026-05-26
updated: 2026-05-26
category: architecture
---
# ColdBox on MatchBox requires 6-layer build-up
Running [[entities/coldbox]] on [[entities/matchbox]]/[[entities/cloudflare-workers]] requires building up in layers: (1) Dynamic BIF registration API, (2) Interceptor/event model, (3) WireBox Lite DI container, (4) Request Context + SES Router, (5) View Renderer + ColdBox Controller shim, (6) ColdBox module system. feature/jit's Native Fusion and dynamic module system already address half of layer 1. Most of ColdBox can be implemented in pure [[entities/boxlang]] (no Rust needed) — the interceptor chain, DI container, request context, router, and view renderer are all BoxLang-level constructs. The Rust boundary is only needed for the BIF registration API and the DO HTTP dispatch bridge.
*Category: architecture*
---
*Captured: 2026-05-26*
## Related
_Add links to related pages._