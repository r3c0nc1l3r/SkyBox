---
type: entity
category: platform
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# Durable Objects

Cloudflare Durable Objects (DO) are stateful, single-writer coordination primitives. They provide the stateful execution environment for [[entities/matchbox]] on [[entities/cloudflare-workers]].

## MatchBox Integration

- Each DO instance runs a BoxLang VM
- Hibernation WebSocket API for lifecycle management (`fetch()`, `webSocketMessage()`, `webSocketClose()`)
- DO storage (`this.ctx.storage`) for persistent state
- Async pause/resume cycle via [[concepts/async-callout-bridge]]
