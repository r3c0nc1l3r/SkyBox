---
type: source
title: "Pure DI service architecture for pi extension"
slug: ortusbooks-pi-service-architecture
status: insight
created: 2026-05-26
updated: 2026-05-26
---
# Pure DI service architecture for pi extension
Refactored the [[ortusbooks-pi-skills-index|ortusbooks-pi]] extension from a 686-line monolithic `index.ts` to a layered Pure DI architecture. `index.ts` is now a 17-line thin bootrapper that delegates to `core/container.ts` which manually wires 4 service classes with their interfaces and passes them to 5 provider functions. **No decorator-based DI library** — tsx/esbuild doesn't support `experimentalDecorators`, so `tsyringe` was tried and removed. The `AgentToolResult` type in the pi SDK requires a `details` field — all provider returns now include `details: {}`. Architecture: `core/` (config, types, container), `services/` (mcp, skills, search, scholar), `providers/` (one per tool/command/event), `lib/` (utilities and formatters).
---
*Captured: 2026-05-26*
## Related
_Add links to related pages._