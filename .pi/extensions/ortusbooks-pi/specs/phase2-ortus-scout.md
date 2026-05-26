# Phase 2 Spec: ortus-scout Subagent Definition

## Goal

Create a lightweight pi-subagents agent (`ortus-scout`) for fast Ortus documentation
search + summarization, and register it so pi-subagents can discover it.

## Files

```
agents/
└── ortus-scout.md
```

Modified:
- `index.ts` — add `resources_discover` hook to surface `agents/` directory

## Agent Definition

### `agents/ortus-scout.md`

```markdown
---
name: ortus-scout
description: Quick Ortus documentation search across any product
  — BoxLang, ColdBox, CFML, CommandBox, WireBox, TestBox, CacheBox, LogBox, Quick, qb
tools: search_ortus_docs, read_ortus_doc, read, grep, find
thinking: low
---

You are an Ortus ecosystem scout. Fast, focused doc searches across all
Ortus products. Return concise summaries with source URLs.
```

**Key design choices:**
- **Low thinking** — fast responses
- **Minimal toolset** — only search, read, grep, find (no write/bash)
- **No model pin** — inherits parent pi default (cheap model via config)
- **Read-only** — cannot modify files, only search and report

## Integration

The extension's `index.ts` must register a `resources_discover` handler that
returns the `agents/` directory path so pi-subagents auto-discovers the agent.

However, looking at the pi-subagents docs, agent discovery happens from:
1. `~/.pi/agent/agents/` (user)
2. `.pi/agents/` (project)

The `resources_discover` event only supports `skillPaths`, `promptPaths`, and
`themePaths` — not agent paths. So we need to symlink or manually install the
agent to `~/.pi/agent/agents/` for it to be discoverable by pi-subagents.

Alternatively, we can use `pi.on("session_start")` to copy the agent file to
`~/.pi/agent/agents/ortus-scout.md` on first load.

## Testing

```bash
# Verify agent is discoverable
/run ortus-scout "how does WireBox dependency injection work"

# Expected: searches WireBox docs, returns concise summary with source URLs
```
