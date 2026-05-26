# Phase 1 Spec: MCP Proxy Tools

## Goal

Build the core MCP proxy layer that exposes two pi tools (`search_ortus_docs`,
`read_ortus_doc`) which call the official GitBook MCP endpoints for 11 Ortus
products. This is the foundation for all subsequent phases — without these tools,
the subagents have no way to query documentation.

## Files

```
.pi/extensions/ortusbooks-pi/
├── index.ts         ← Entry: registers 2 tools + event hooks
├── sources.ts       ← 11 product → MCP URL definitions
└── mcp-client.ts    ← SSE MCP client: POST + SSE response parsing
```

## Interface

### Tool 1: `search_ortus_docs`

**Registration:**
```typescript
pi.registerTool({
  name: "search_ortus_docs",
  label: "Search Ortus Docs",
  description: "Search Ortus Solutions documentation for a query. "
    + "Optionally filter to one product. Returns matching pages with URLs and excerpts.",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
    product: Type.Optional(Type.String({
      description: "Product to search (boxlang, coldbox, commandbox, etc.)"
    })),
    maxResults: Type.Optional(Type.Number({
      description: "Max results per product",
      default: 5
    })),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // ...implementation
  },
});
```

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | — | Natural language search query |
| `product` | string | no | (all) | Filter to one product slug |
| `maxResults` | number | no | 5 | Max results per product |

**Returns to LLM (markdown text):**
```markdown
## BoxLang — Cache Service

[Cache Service](https://boxlang.ortusbooks.com/boxlang-framework/caching/cache-service)
> The Cache Service broadcasts events throughout cache lifecycles...
> Events are announced automatically via the interceptor service...

## ColdBox — Interceptors

[Interceptors](https://coldbox.ortusbooks.com/7.x/digging-deeper/interceptors)
> ColdBox interceptors follow the Observer pattern...
```

When a product filter is provided, only that product is searched.
When omitted, ALL products are searched in parallel (max 4 concurrent).

### Tool 2: `read_ortus_doc`

**Registration:**
```typescript
pi.registerTool({
  name: "read_ortus_doc",
  label: "Read Ortus Doc",
  description: "Fetch the full markdown content of a specific documentation page.",
  parameters: Type.Object({
    url: Type.String({
      description: "Full page URL from search results"
    }),
    maxLength: Type.Optional(Type.Number({
      description: "Max content length (default: 8000)",
      default: 8000
    })),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // ...implementation
  },
});
```

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | string | yes | — | Full URL from search results |
| `maxLength` | number | no | 8000 | Truncation guard for context window |

**Returns to LLM (markdown text):** Full page content as markdown, truncated
to `maxLength` bytes. If truncated, appends `[...content truncated at N bytes]`.

## Backend

### `sources.ts`

```typescript
export interface ProductSource {
  name: string;
  label: string;
  mcpUrl: string;
  priority: "core" | "important" | "niche";
}

export const PRODUCTS: ProductSource[] = [
  { name: "boxlang",    label: "BoxLang",     mcpUrl: "https://boxlang.ortusbooks.com/~gitbook/mcp",     priority: "core" },
  { name: "coldbox",    label: "ColdBox",     mcpUrl: "https://coldbox.ortusbooks.com/~gitbook/mcp",     priority: "core" },
  { name: "commandbox", label: "CommandBox",  mcpUrl: "https://commandbox.ortusbooks.com/~gitbook/mcp",  priority: "core" },
  { name: "wirebox",    label: "WireBox",     mcpUrl: "https://wirebox.ortusbooks.com/~gitbook/mcp",     priority: "core" },
  { name: "testbox",    label: "TestBox",     mcpUrl: "https://testbox.ortusbooks.com/~gitbook/mcp",    priority: "important" },
  { name: "cachebox",   label: "CacheBox",    mcpUrl: "https://cachebox.ortusbooks.com/~gitbook/mcp",   priority: "important" },
  { name: "logbox",     label: "LogBox",      mcpUrl: "https://logbox.ortusbooks.com/~gitbook/mcp",      priority: "important" },
  { name: "quick",      label: "Quick ORM",   mcpUrl: "https://quick.ortusbooks.com/~gitbook/mcp",      priority: "important" },
  { name: "qb",         label: "qb",          mcpUrl: "https://qb.ortusbooks.com/~gitbook/mcp",          priority: "important" },
  { name: "contentbox", label: "ContentBox",  mcpUrl: "https://contentbox.ortusbooks.com/~gitbook/mcp",  priority: "niche" },
  { name: "docbox",     label: "DocBox",      mcpUrl: "https://docbox.ortusbooks.com/~gitbook/mcp",      priority: "niche" },
];
```

### `mcp-client.ts`

Single exported async function:

```typescript
export async function callMCPTool(
  mcpUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  // POST JSON-RPC to MCP endpoint
  // Accept header: "application/json, text/event-stream"
  // Parse SSE data: lines starting with "data: "
  // Return the text content from result.content[0].text
  // On error: throw descriptive error
}
```

**MCP JSON-RPC request:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "searchDocumentation",
    "arguments": { "query": "..." }
  }
}
```

**SSE response parsing:**
```
event: message
data: {"jsonrpc":"2.0","id":"1","result":{"content":[{"type":"text","text":"..."}]}}

→ Extract text from result.content[0].text
```

### Data Flow

```
Tool call → index.ts → mcp-client.ts → POST /~gitbook/mcp → Parse SSE → Return markdown
                                                              ↑
                                                         signal (abort)
```

For multi-product searches: `Promise.allSettled()` with max 4 concurrent,
collect successes, log failures.

## Edge Cases

| Case | Handling |
|------|----------|
| **MCP endpoint down** | Return error message: "BoxLang docs unavailable (HTTP 5xx)". Other products unaffected. |
| **Timeout** | 10s timeout per product. Log timeout error, skip that product. |
| **Empty results** | Return "No results found for '{query}' in {product}." |
| **Abort (Ctrl+C)** | Pass `ctx.signal` to all fetch() calls. Early-exit on abort. |
| **Malformed SSE** | If no `data:` lines found, throw "Unexpected MCP response format". |
| **Invalid product name** | Return helpful error listing valid product names. |
| **Rate limiting** | No special handling for v1. Assume GitBook MCP is unthrottled. |
| **getPage with non-ortus URL** | Validate URL starts with a known product base URL. Reject others. |

## Testing

### Manual verification commands

```bash
# Test search_ortus_docs
curl -X POST "https://boxlang.ortusbooks.com/~gitbook/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"searchDocumentation","arguments":{"query":"scheduled tasks"}}}'

# Expected: SSE response with "Scheduled Tasks" page content

# Test getPage
curl -X POST "https://coldbox.ortusbooks.com/~gitbook/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"getPage","arguments":{"url":"https://coldbox.ortusbooks.com/7.x/getting-started/overview"}}}'

# Expected: Full page markdown
```

### In-pi testing

```
search_ortus_docs(query="dependency injection", product="wirebox")
→ Should return WireBox DI documentation with code examples

search_ortus_docs(query="scheduled tasks", product="boxlang")
→ Should return BoxLang scheduling docs with DSL examples

search_ortus_docs(query="deploy docker")
→ Should search ALL products, return mixed results

read_ortus_doc(url="https://boxlang.ortusbooks.com/boxlang-framework/caching/cache-service")
→ Should return full page markdown

read_ortus_doc(url="https://evil.com/malware")
→ Should reject with error about non-Ortus URL
```

## Acceptance Criteria

- [ ] Both tools register successfully and appear in `pi.getAllTools()`
- [ ] `search_ortus_docs` returns results from all 11 confirmed endpoints
- [ ] `search_ortus_docs` with product filter only returns that product
- [ ] `read_ortus_doc` returns full page markdown for valid URLs
- [ ] `read_ortus_doc` rejects non-Ortus URLs
- [ ] Search across all products returns in <10s total
- [ ] Ctrl+C during search aborts mid-flight
- [ ] Invalid product names show helpful error
- [ ] Empty queries return "No results" rather than error
