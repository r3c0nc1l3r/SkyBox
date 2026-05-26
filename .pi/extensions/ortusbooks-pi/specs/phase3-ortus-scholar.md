# Phase 3 Spec: ortus-scholar Custom Tool + Agent

## Goal

Create the **Ortus Scholar** — a deep context builder that searches across all
Ortus products, reads full pages, and returns a structured opinionated ecosystem
context pack to the main LLM.

Two delivery mechanisms:
1. **Custom tool** (`ortus_scholar`) — native, no subprocess
2. **pi-subagents agent** (`ortus-scholar`) — for `/run ortus-scholar "..."`

## Files

- `agents/ortus-scholar.md` — pi-subagents agent definition
- `index.ts` — add `ortus_scholar` custom tool
- `.pi/agents/ortus-scholar.md` — symlink

## Custom Tool: `ortus_scholar`

### Parameters
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `task` | string | yes | — | What to research or build context for |
| `products` | string[] | no | all core | Products to focus on |
| `depth` | string | no | "quick" | "quick" or "thorough" |

### Returns

Structured context pack as markdown:

```
## Ecosystem Map
How the products relate for this task.

## Key Documentation
Top search results with code examples and API references.

## Architecture Patterns
Conventions, patterns, and caution areas.

## Implementation Guidance
Opinionated recommendations for the task.
```

### Backend

1. Search each relevant product using MCP
2. Score/top results by relevance heuristic
3. Read full pages for top 2-3 overall results
4. Assemble everything into a structured markdown pack
5. Return to the LLM

## Agent: `ortus-scholar`

pi-subagents compatible agent definition with write tool access for producing
context.md output files. Medium thinking for deeper synthesis.
