---
title: BIF Availability
description: Which BoxLang BIFs work on the wasm32-unknown-unknown target.
---

## Available BIFs

These BIFs work on the WASM target:

`trim`, `len`, `mid`, `lcase`, `ucase`, `listToArray`, `arrayAppend`, `arrayLen`,
`arrayDeleteAt`, `isArray`, `isStruct`, `isNull`, `isNumeric`, `isBoolean`,
`max`, `min`, `round`, `floor`, `ceiling`, `serializeJSON`, `structNew`,
`arrayNew`, `toString`, `now`

String/char comparison operators also work:

```boxlang
if (c >= "0" && c <= "9") { ... }  // Works
if (c >= "a" && c <= "z") { ... }  // Works
```

## Cloudflare Binding BIFs (Available via JS Bridge)

These BIFs call Cloudflare APIs through the JS callout bridge and work on WASM:

| BIF | Purpose | Returns |
|-----|---------|---------|
| `d1Query(binding, sql, [params])` | SELECT from D1 | Array of structs |
| `d1Execute(binding, sql, [params])` | INSERT/UPDATE/DELETE on D1 | Affected row count |
| `mxaiEmbed(input)` | Generate text embeddings | Array of vectors |
| `mxaiVectorizeUpsert(binding, vectorsJson)` | Store vectors in Vectorize | Upserted count |
| `mxaiVectorizeQuery(binding, vectorJson, topK, filter)` | Semantic search | Matches with scores |
| `openRouterChat(binding, messagesJson, userId, prompt)` | AI chat via OpenRouter | Streams via SSE |
| `tursoQuery(sql, [params])` | SELECT from Turso | Array of rows |
| `tursoExecute(sql, [params])` | INSERT/UPDATE/DELETE on Turso | Affected row count |

> All binding BIFs use the [async pause/resume cycle](/architecture/overview#async-pauseresume-cycle) — the VM yields, JS resolves the promise, then the VM resumes.

## Unavailable BIFs

| BIF | Alternative |
|-----|-------------|
| `deserializeJSON` | Manual structural validation (see [workarounds](/wasm/bif-workarounds)) |
| `int(string)` | Compare as strings: `id & "" == "1" & ""` |
| `val(string)` | Avoid string-to-number conversion |
| `asc(char)` | Direct character comparison `c >= "a"` |
| `chr(num)` | N/A |
| `dateFormat` | N/A |
| `parseDateTime` | N/A |
| `year`, `month`, `day` | N/A |
| `pi` | Use literal `3.14159` |
| `sin` | N/A |
| `abs` | Manual: `if (x < 0) x = 0 - x` |
| `reReplace` | Manual character iteration |
| `replace` | Manual string rebuild |
