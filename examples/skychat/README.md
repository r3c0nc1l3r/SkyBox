# SkyChat — RAG-Powered AI Chat

**Live URL**: [skybox-skychat.codetek.us](https://skybox-skychat.codetek.us)

SkyChat is an AI chat application that uses Retrieval-Augmented Generation (RAG) to answer questions about BoxLang. It demonstrates SkyBox's ability to combine BoxLang WebSocket listeners with OpenRouter AI streaming, Cloudflare Vectorize semantic search, D1 persistence, and Server-Sent Events (SSE).

## Architecture

```
                         ┌───────────────────────────────────┐
                         │  Client Browser                    │
                         │  ┌───────────────────────────────┐ │
                         │  │  Tailwind CSS UI              │ │
                         │  │  ├── WebSocket (send/receive) │ │
                         │  │  └── EventSource (SSE stream) │ │
                         │  └───────────────────────────────┘ │
                         └──────────┬────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              WebSocket /?cid=...  / (HTTP)   /?cid=... (SSE)
                    │               │               │
                    ▼               ▼               ▼
              ┌──────────────────────────────────────────┐
              │  Durable Object: MatchBoxWebSocketDO       │
              │                                            │
              │  ┌──────────────────────────────────────┐  │
              │  │  BoxLang VM (SkychatListener.bx)      │  │
              │  │                                       │  │
              │  │  onConnect → welcome + seed RAG       │  │
              │  │  onMessage → retrieveContext()        │  │
              │  │             → openRouterChat()         │  │
              │  │  onHttpGet → serve HTML page          │  │
              │  └──────────────────┬───────────────────┘  │
              │                     │                       │
              │  ┌──────────────────▼───────────────────┐  │
              │  │  JS Callout Bridge                    │  │
              │  │                                       │  │
              │  │  aiEmbed() → Workers AI (BGE model)  │  │
              │  │  mxaiVectorizeUpsert() → Vectorize    │  │
              │  │  mxaiVectorizeQuery() → Vectorize     │  │
              │  │  d1Query/Execute() → D1               │  │
              │  │  openRouterChat() → OpenRouter API    │  │
              │  └───────────────────────────────────────┘  │
              └──────────────────────────────────────────┘
```

## Cloudflare Bindings

| Binding | Name | Purpose |
|---------|------|---------|
| **D1** | `DB` | Vector memory store (SQLite) |
| **Vectorize** | `VECTORIZE` | Semantic search index (768-dim vectors) |
| **DO** | `WEBSOCKET_DO` | Durable Object hosting the BoxLang VM |
| **Secrets** | `OPENROUTER_API_KEY` | OpenRouter API key for AI chat |

## Features

- **AI chat with RAG** — each user message is embedded via Workers AI, searched against Vectorize, and relevant knowledge chunks are injected into the OpenRouter prompt
- **OpenRouter streaming** — AI responses are streamed via Server-Sent Events (SSE) back to the client
- **In-memory conversation history** — per-user message history stored in the BoxLang VM's `variables.history` (survives DO hibernation)
- **HTML UI via `onHttpGet`** — the BoxLang listener serves a complete Tailwind CSS chat interface directly from the WASM runtime (no separate frontend build needed)
- **15 built-in knowledge facts** — pre-seeded facts about BoxLang syntax, OOP, string ops, arrays, JSON, WebSockets, MatchBox, RAG, D1, and semantic search
- **RAG debug panel** — toggleable overlay showing matched chunks, scores, and keywords for each query
- **Auto-reconnect** — WebSocket and SSE auto-reconnect with exponential backoff

## Project Structure

```
examples/skychat/
├── src/listeners/
│   └── SkychatListener.bx       # BoxLang Listener class (WebSocket + HTTP + AI)
├── mcf-worker.js                # DO shell with OpenRouter + Vectorize handlers
├── wrangler.toml                # Cloudflare Workers config
├── wrangler.toml.example        # Template with instructions
├── schema.sql                   # D1 database schema
├── build-multi.sh               # Multi-file build script
├── state.json                   # Initial listener state
└── assets/                      # Static assets (empty; HTML is served inline)
```

## Listener Commands

The SkyChat WebSocket listener accepts plain text messages:

- Any text message is treated as an AI chat prompt
- `__ping__` — health check (responds with `__pong__`)

The listener runs this flow per message:

```
user message → aiEmbed() → Vectorize query → D1 text lookup
→ build RAG context → OpenRouter chat (streaming) → SSE chunks
```

## SSE Event Types

| Event | Description |
|-------|-------------|
| `welcome` | Connection established, contains `userId` |
| `user_msg` | Echo of the user's message |
| `rag_debug` | RAG match details (chunks, scores, keywords) |
| `ai_start` | AI response started |
| `ai_chunk` | Streamed token from OpenRouter (content) |
| `ai_done` | Response complete |
| `error` | Error message |

## Setup

```bash
# 1. Create Cloudflare resources
npx wrangler d1 create skybox-skychat
npx wrangler vectorize create skybox-skychat-vectors --dimensions 768

# 2. Configure wrangler.toml with resource IDs
cp wrangler.toml.example wrangler.toml
# Edit: fill in database_id

# 3. Set the OpenRouter API key
npx wrangler secret put OPENROUTER_API_KEY

# 4. Build and deploy
npm run build
npm run deploy
```

## Build

```bash
npm run build
```

The `build-multi.sh` script:
1. Concatenates BoxLang sources from `src/listeners/`
2. Copies static assets to `dist/assets/`
3. Runs the standard SkyBox build pipeline
4. Generates a symlink for `wrangler dev`

## Dev

```bash
npm run dev
```

This runs the build and starts `wrangler dev --local`. The app serves its own HTML UI at `http://localhost:8787/`.

## How RAG Works

1. **User types**: "How do I use classes in BoxLang?"
2. **Embed**: `aiEmbed(query)` calls Workers AI `@cf/baai/bge-base-en-v1.5` to get a 768-dimension embedding
3. **Search**: `mxaiVectorizeQuery("VECTORIZE", embedding, 5, {})` finds the top 5 most similar vectors by cosine distance
4. **Score conversion**: Vectorize returns cosine distance (0=identical, 2=opposite), converted to BXAI score: `score = 1 - (distance / 2)`
5. **Filter**: results with score < 0.3 are discarded
6. **Retrieve**: `d1Query("DB", "SELECT text FROM vector_store_ai_memory WHERE id = ?", [id])` fetches the original text
7. **Build context**: matched chunks are concatenated into a knowledge context string
8. **Chat**: the system message includes the RAG context, and the conversation is sent to OpenRouter via `openRouterChat()`
9. **Stream**: OpenRouter streams tokens back as `ai_chunk` SSE events
