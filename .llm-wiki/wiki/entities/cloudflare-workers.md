---
type: entity
category: platform
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# Cloudflare Workers

Cloudflare Workers is a serverless edge computing platform that runs JavaScript/WASM on Cloudflare's global network. The SkyBox project deploys [[entities/matchbox]] as a Cloudflare Worker using [[entities/durable-objects]].

## MatchBox Integration

The `matchbox-cf-worker` crate provides the integration layer:
- HTTP requests dispatched via `vm_on_http_request()` → BoxLang listener returning `{status, headers, body}`
- WebSocket lifecycle managed via `onConnect`, `onMessage`, `onClose`
- Cloudflare bindings (D1, Vectorize, Workers AI, Turso) accessed via [[concepts/async-callout-bridge]]
