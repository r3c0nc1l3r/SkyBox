# Ortus Documentation Search — Pi Extension Plan

## Naming

The extension covers the full **Ortus Solutions ecosystem**:

| Layer | Products |
|-------|----------|
| Core language | BoxLang, CFML |
| Web framework | ColdBox HMVC |
| Libraries | WireBox (DI), CacheBox, LogBox, TestBox |
| CLI & tooling | CommandBox, DocBox |
| Data | Quick ORM, qb |
| CMS | ContentBox |

A subagent name needs to convey **comprehensive, opinionated knowledge of
all of the above** — not just BoxLang.

### Options

| Name | Vibe | Notes |
|------|------|-------|
| **ortus-scholar** | Studied, authoritative | Fits pi-subagents style (single-word role) |
| **ortus-sage** | Wise, experienced | Strong ecosystem-knowledge connotation |
| **ortus-architect** | Structural, opinionated | Matches the "build context" intent |
| **ortus-explorer** | Discovery-oriented | Lighter weight, less opinionated |
| **ortus-loremaster** | Fantasy, memorable | Risk: too niche for some |
| **ortus-vault** | Keeper of all knowledge | Good for the "deep context" role |

> **Pick one before building.** All references below use `ortus-scholar` as a
> placeholder — swap when decided.

The extension directory is `ortusbooks-pi/`. The subagent name is
what gets invoked: `/run ortus-scholar "how does caching work in this ecosystem"`.

*Subject to change — discuss below.*

## Overview

A pi extension that provides opinionated Ortus ecosystem expertise to the
agent session. Two-tier architecture:

1. **MCP proxy tools** — Direct `search_ortus_docs` + `read_ortus_doc` tools that
   call the official GitBook MCP endpoints. Fast, stateless, no subprocess overhead.
   Use for quick lookups during a session.

2. **Ortus Scholar subagent** — Spawns a **cheap model** subprocess (DeepSeek
   Flash, per your pi config) that searches docs across all products, synthesizes
   context, and returns a structured opinionated knowledge pack to the main agent.
   Use for deep context building before Ortus ecosystem work.

> **Key insight:** Ortus provides official **MCP endpoints** at
> `https://{product}.ortusbooks.com/~gitbook/mcp` for every major product.
> Each exposes `searchDocumentation(query)` and `getPage(url)` via SSE transport.
> We proxy these into pi tools, then wrap them in a cheap-model subagent that
> builds opinionated ecosystem context.

## Discovered MCP Endpoints

Every product endpoint confirmed working:

| Product       | MCP Endpoint URL                                                        | Priority    | .mcp.json |
|---------------|-------------------------------------------------------------------------|-------------|-----------|
| BoxLang       | `https://boxlang.ortusbooks.com/~gitbook/mcp`                           | 🔴 core     | ✅        |
| ColdBox       | `https://coldbox.ortusbooks.com/~gitbook/mcp`                           | 🔴 core     | ✅        |
| CommandBox    | `https://commandbox.ortusbooks.com/~gitbook/mcp`                        | 🔴 core     | ❌        |
| WireBox       | `https://wirebox.ortusbooks.com/~gitbook/mcp`                           | 🔴 core     | ✅        |
| TestBox       | `https://testbox.ortusbooks.com/~gitbook/mcp`                           | 🟡 important| ✅        |
| CacheBox      | `https://cachebox.ortusbooks.com/~gitbook/mcp`                          | 🟡 important| ✅        |
| LogBox        | `https://logbox.ortusbooks.com/~gitbook/mcp`                            | 🟡 important| ✅        |
| Quick ORM     | `https://quick.ortusbooks.com/~gitbook/mcp`                             | 🟡 important| ❌        |
| qb            | `https://qb.ortusbooks.com/~gitbook/mcp`                                | 🟡 important| ❌        |
| DocBox        | `https://docbox.ortusbooks.com/~gitbook/mcp`                            | 🔵 niche    | ✅        |
| ContentBox    | `https://contentbox.ortusbooks.com/~gitbook/mcp`                        | 🔵 niche    | ❌        |

These match the Ortus-Solutions/skills [`.mcp.json`](https://github.com/Ortus-Solutions/skills/blob/main/.mcp.json)
and extend beyond it with 4 more products (commandbox, quick, qb, contentbox).

Products **without** MCP endpoints (different host):
- `bx-ai` → may be at `https://ai.ortusbooks.com` or hosted under `bx-ai.ortusbooks.com` (connection refused)
- `bx-compat-cfml`, `cbstreams`, `cbstorages` — no subdomain found

## MCP Transport

Each endpoint uses **SSE (Server-Sent Events)** framing over HTTP POST:

```
POST /~gitbook/mcp
Content-Type: application/json
Accept: application/json, text/event-stream

→ {"jsonrpc":"2.0","id":"1","method":"tools/call",
     "params":{"name":"searchDocumentation","arguments":{"query":"..."}}}
← event: message
  data: {"jsonrpc":"2.0","id":"1","result":{"content":[{...}]}}
```

Each request produces a single synchronous data event — no streaming, no persistent
connection needed. Simple round-trip.

## Extension Structure

```
.pi/extensions/ortusbooks-pi/
├── PLAN.md                       # This file
├── index.ts                      # Entry point — registers tools + subagent
├── sources.ts                    # 11 product → MCP URL definitions
├── mcp-client.ts                 # SSE MCP client: POST + parse
├── agents/                       # Subagent definitions for pi-subagents
│   ├── ortus-scout.md            # Lightweight: search + summarize
│   └── ortus-scholar.md          # Deep: ecosystem-wide context building
└── prompts/                      # Prompt templates for common workflows
    ├── ortus-investigate.md      # "Investigate how X works in this ecosystem"
    └── ortus-port.md             # "Port this BXAI feature to MXAI"
```

## Two-Tier Architecture

```
                ┌─────────────────────────────────────┐
                │        Main Session (expensive)      │
                │    e.g. Claude Sonnet / Opus         │
                │                                      │
                │  Uses context pack for informed work │
                └──────┬──────────────┬───────────────┘
                       │              │
            Tool Call  │              │  Subagent call
          (fast path)  │              │  (deep context)
                       ▼              ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│  search_ortus_docs       │  │  ortus_scholar              │
│  read_ortus_doc          │  │  (cheap model subprocess)    │
│                          │  │                              │
│  Direct MCP proxy        │  │  Searches ALL products       │
│  ~500ms per call         │  │  Reads top pages             │
│  Returns snippets/pages  │  │  Synthesizes ecosystem map   │
│                          │  │  Returns context pack        │
└──────────┬───────────────┘  └──────────────┬───────────────┘
           │                                  │
           ▼                                  ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│  Ortus MCP Endpoints     │  │  MCP endpoints + 70 BoxLang  │
│  (11 products)           │  │  skills + project knowledge  │
└──────────────────────────┘  └──────────────────────────────┘
```

### Tier 1: Direct MCP Proxy Tools

Two `pi.registerTool()` calls, available to the main LLM directly.

#### `search_ortus_docs`

**Parameters:**
- `query` (string, required) — Search query (e.g. "dependency injection", "scheduled tasks")
- `product` (string, optional) — Filter to one product
- `maxResults` (number, optional, default: 5)

**Returns:** Markdown with title, URL, content excerpts per result.

**Backend:** Calls `searchDocumentation` on the product's MCP endpoint.
If no product specified, calls ALL products in parallel (max 4 concurrent).

#### `read_ortus_doc`

**Parameters:**
- `url` (string, required) — Full URL from search results

**Returns:** Full page content as markdown (truncated to ~8KB).

**Backend:** Calls `getPage` on the product's MCP endpoint.

### Tier 2: Ortus Scholar Subagent

Registers an `ortus_scholar` tool that spawns a **cheap model subprocess**
(DeepSeek Flash from your default pi config) to do heavy context building.

**Parameters:**
- `task` (string, required) — What you need to understand or build
- `products` (string[], optional) — Products to focus on (default: all core)
- `depth` ("quick" | "thorough", optional, default: "quick")

**Returns:** A structured context pack as markdown:

```
## Ecosystem Map
How BoxLang, ColdBox, WireBox etc. relate for this task.

## Key Documentation
Search results with relevant code examples and API references.

## Architecture Patterns
What patterns apply, what conventions to follow, what caution areas exist.

## Implementation Guidance
Opinionated recommendations based on Ortus ecosystem conventions.

## Related Skills
Which local skills are relevant (boxlang-* skills on this machine).
```

**Backend (`ortus_scholar` tool execution):**
1. Parses the task to determine which products are relevant
2. Calls MCP endpoints with cheap model to search docs
3. Calls `getPage` for top results to get full content
4. References relevant `boxlang-*` skills from `~/.agents/skills/`
5. Passes everything to the cheap model for synthesis
6. Returns the synthesized context pack

**Model choice:** The subagent uses whatever model pi defaults to (currently
`deepseek-v4-flash`) or can be explicitly overridden. It's cheap enough to do
5-10 MCP round-trips + synthesis for pennies.

## Subagent Agent Definitions

Defined as standard pi-subagents agent markdown files, placed alongside the
extension so `resources_discover` can surface them:

### `agents/ortus-scout.md` (lightweight)

```markdown
---
name: ortus-scout
description: Quick Ortus documentation search across any product
  — BoxLang, ColdBox, CFML, CommandBox, WireBox, TestBox, CacheBox, LogBox, Quick, qb
tools: search_ortus_docs, read_ortus_doc, read, grep, find
model: deepseek-v4-flash
thinking: low
---

You are an Ortus ecosystem scout. Fast, focused doc searches across all
Ortus products. Return concise summaries with source URLs.

Working rules:
- Start with search_ortus_docs, filtering by product when the target is clear
- read_ortus_doc for full page content on the most promising result
- Synthesize findings into a brief with product names and source URLs
```

### `agents/ortus-scholar.md` (deep context)

```markdown
---
name: ortus-scholar
description: Comprehensive Ortus ecosystem research and context building
  — BoxLang, CFML, ColdBox, WireBox, CacheBox, LogBox, TestBox, CommandBox, Quick, qb
tools: search_ortus_docs, read_ortus_doc, read, grep, find, write, intercom
model: deepseek-v4-flash
thinking: medium
---

You are an Ortus ecosystem scholar with deep knowledge of the full stack:
BoxLang language, CFML compatibility, ColdBox HMVC framework, WireBox DI,
CacheBox caching, LogBox logging, TestBox testing, CommandBox CLI and
package management, Quick ORM, qb query builder, and associated modules.

Given a task, build a comprehensive context pack:
- Search ALL relevant product docs via search_ortus_docs
- Read full pages for the most relevant results via read_ortus_doc
- Cross-reference the ~70 local BoxLang skills for conventions
- Synthesize opinionated recommendations based on ecosystem patterns
- Identify which product(s) are primary for the task and which support
- Output structured context.md that another agent can act on directly

Working rules:
- Start broad, then narrow: search the ecosystem, then dive into specifics
- Know the ecosystem structure: ColdBox uses WireBox for DI, CacheBox
  plugs into any framework, CommandBox manages servers and packages, etc.
- Call out CFML vs BoxLang differences when relevant
- Report source confidence: "BoxLang docs state..." vs "based on pattern across products..."
- When code examples are needed, show both BoxLang and CFML where they differ
```

## Prompt Templates

Provide reusable `/ortus-investigate` and `/ortus-port` workflows:

### `prompts/ortus-investigate.md`

```
/ortus-investigate <topic>

Runs ortus-scout to research a topic, then returns findings to the main session.
```

### `prompts/ortus-port.md`

```
/ortus-port <feature>

Runs ortus-scholar to build ecosystem context for porting a BXAI feature to MXAI,
covering BoxLang syntax, WireBox DI patterns, ColdBox conventions, etc.
```

## Why This Architecture

| Decision | Rationale |
|----------|-----------|
| **Two tiers, not one** | Quick lookups don't need a subprocess. Deep context does. Each model works at its appropriate level. |
| **Cheap model for subagent** | DeepSeek Flash costs pennies. Let it do 10 tool calls and synthesis while the main model sits idle. Main model only gets the distilled context pack. |
| **Opinionated, not just search** | The subagent knows BoxLang ecosystem structure — not just a dumb search results page. It knows WireBox is DI, CacheBox is caching, etc., and contextualizes across products. |
| **Separate agent definitions** | Following pi-subagents convention means the agents work with `/run ortus-scout "..."` and benefit from all subagent features (chain, parallel, progress). |
| **MCP proxy as foundation** | Even without the subagent, the two direct tools are immediately useful for quick doc queries during any session. |

## Integration with Existing Skills

The 70+ `boxlang-*` skills at `~/.agents/skills/` cover individual topics
(scheduled-tasks, caching, testing, BIF development, etc.). The extension
complements them:

- **Skills** = "how to write BoxLang scheduled tasks" (procedural instructions)
- **MCP proxy** = "what's the latest API signature" (live documentation)
- **Subagent** = "give me the full picture of how scheduled tasks, caching,
  and async programming interact in this ecosystem" (synthesis)

The subagent can be instructed to reference relevant skills by name when
building its context pack.

## Subagent Design for pi-subagents Compatibility

The extension registers the agent `.md` files and prompt `.md` files via
`resources_discover` event so they're auto-discovered by pi-subagents:

```typescript
pi.on("resources_discover", () => {
  return {
    skillPaths: [],
    promptPaths: [join(extDir, "prompts")],
    // Agent paths aren't in resources_discover yet — we register
    // them by manually installing in ~/.pi/agent/agents/
  };
});
```

For the subagent tool itself, the extension can either:
1. **Register a custom `ortus_scholar` tool** that handles MCP calls + cheap model synthesis natively (no subprocess)
2. **Rely on pi-subagents** with the agent definitions, letting the LLM call `subagent({ agent: "ortus-scholar", task: "..." })`

Option 1 is faster (no subprocess), option 2 is more flexible (chains, parallel, progress). We can do both — the agent definitions work with pi-subagents, and a custom tool provides the optimized path.

## Pi Extension APIs Used

| API | Purpose |
|-----|---------|
| `pi.registerTool()` | `search_ortus_docs` + `read_ortus_doc` + `ortus_scholar` |
| `pi.registerCommand()` | Extension management |
| `pi.on("resources_discover")` | Surface agent definitions and prompts |
| `pi.on("session_start")` | Verify MCP endpoints on startup |
| `ctx.signal` | Pass to fetch() for abort |
| `ctx.ui.notify()` | Startup confirmation, errors |
| `StringEnum` | Tool parameter validation |

## Phased Build

| Phase | What | Files | Delivers |
|-------|------|-------|----------|
| 1 | Core MCP proxy — `search_ortus_docs` + `read_ortus_doc` tools | `index.ts` + `sources.ts` + `mcp-client.ts` | Fast direct doc search |
| 2 | `ortus-scout` agent definition + `resources_discover` | `agents/ortus-scout.md` | Works with pi-subagents |
| 3 | `ortus_scholar` custom tool (native synthesis) | update `index.ts` | Optimized no-subprocess path |
| 4 | `ortus-scholar` agent + prompt templates | `agents/ortus-scholar.md`, `prompts/` | Deep ecosystem context |
| 5 | Local caching of MCP responses | `cache.ts` | Faster repeat searches |
| 6 | Startup verification + polish | update `index.ts` | Production quality |

## Summary

```
Direct tools:  search_ortus_docs  ────→  MCP (fast, ~500ms)
               read_ortus_doc     ────→  MCP (fast, ~500ms)

Subagent:      ortus_scholar      ────→  cheap model → MCP → synthesis
               ortus-scout        ────→  pi-subagents agent (lightweight)
               ortus-scholar      ────→  pi-subagents agent (deep context)

Main agent gets:  direct search power + deep opinionated context = 🚀
```
