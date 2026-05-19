# BoxDox — BoxLang Documentation Viewer

**Live URL**: [skybox-boxdox.codetek.us](https://skybox-boxdox.codetek.us)

BoxDox is a full-stack documentation viewer that serves BoxLang documentation with semantic search and an AI chat assistant. It demonstrates SkyBox's ability to combine BoxLang WebSocket listeners with Cloudflare's D1, Vectorize, Workers AI, R2, and static assets.

## Architecture

```
                         ┌──────────────────────────────────────┐
                         │  Cloudflare Edge                      │
                         │  [assets]: dist/assets/               │
                         │    ├── /index.html  (React SPA)       │
                         │    ├── /content/... (markdown docs)   │
                         │    └── /nav-tree.json                 │
                         └──────────┬───────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
   /api/page → JS handler    /api/search → BoxLang VM    /events → SSE
   (reads from assets)       (via DO, Vectorize, D1)     (streaming)
          │                         │                         │
          │                         ▼                         │
          │                  ┌──────────────┐                 │
          └─────────────────►│ Durable Object │◄───────────────┘
                             │ MatchBoxWebSocketDO │
                             └────────┬──────┬───┘
                                      │      │
                                      ▼      ▼
                                 Vectorize   D1
                                 (semantic   (document
                                  search)     storage)
                                      │
                                      ▼
                                 Workers AI
                                 (embeddings + Gemma 4)
```

## Cloudflare Bindings

| Binding | Name | Purpose |
|---------|------|---------|
| **D1** | `DB` | Document and chunk storage (SQLite) |
| **Vectorize** | `VECTORIZE` | Semantic search index (768-dim vectors) |
| **Workers AI** | `AI` | Embeddings (`@cf/baai/bge-small-en-v1.5`) + Chat (`@cf/google/gemma-4-26b-a4b-it`) |
| **R2** | `DOCS_BUCKET` | Raw documentation content files |
| **Assets** | `ASSETS` | Static files (React SPA, nav tree, content) |
| **DO** | `WEBSOCKET_DO` | Durable Object hosting the BoxLang VM |

## Features

- **React SPA frontend** — built with Vite + TypeScript + Tailwind CSS, served via Cloudflare `[assets]`
- **Semantic search** — boxdox uses `mxaiEmbed` + `mxaiVectorizeQuery` in the BoxLang listener to search documentation by meaning
- **AI chat** — The JS shell intercepts `chat ...` messages from the WebSocket, runs a RAG pipeline (embed → Vectorize query → D1 lookup → Workers AI streaming), and sends results back via SSE events
- **Doc navigation** — AI response includes a `navigate` SSE event that auto-scrolls the client to the best matching page
- **Rate limiting** — 10 calls/min per connection, 1000 calls/day global
- **Idempotent seeding** — documents are seeded once; the `seeded` flag persists in DO storage

## Project Structure

```
examples/boxdox/
├── src/listeners/
│   └── BoxDoxListener.bx       # BoxLang Listener class (WebSocket + HTTP)
├── client/                      # React/TypeScript SPA (Vite)
│   ├── src/                     # React components and pages
│   ├── src/App.tsx              # Main app with SSE + WebSocket client
│   ├── index.html               # Entry point
│   └── vite.config.ts           # Vite build config
├── mcf-worker.js                # DO shell with RAG pipeline + JS API endpoints
├── wrangler.toml                # Cloudflare Workers config
├── wrangler.toml.example        # Template with instructions
├── schema.sql                   # D1 database schema
├── build-multi.sh               # Multi-file build script
├── state.json                   # Initial listener state
├── content/                     # BoxLang docs content (markdown)
└── scripts/                     # Content upload helpers
```

## Listener Commands

The BoxDox WebSocket listener accepts text commands:

| Command | Description |
|---------|-------------|
| `search <query>` | Search documentation semantically (via Vectorize) |
| `list` | List all indexed documents |
| `seed` | Re-seed the document database |
| `stats` | Get document and chunk counts |
| `chat <message>` | AI chat with RAG (intercepted by JS shell) |
| `__ping__` | Health check (responds with `__pong__`) |

## HTTP API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Serve the React SPA |
| `GET /api/page?path=<path>` | Fetch a rendered markdown page |
| `GET /api/nav-tree` | Get the navigation tree JSON |
| `GET /api/search?q=<query>` | Semantic search (JSON response) |
| `GET /api/stats` | Document/chunk counts |
| `GET /api/documents` | List all documents |
| `POST /api/seed` | Seed all docs into D1 + Vectorize |
| `POST /api/ingest` | Ingest a single document |
| `GET /api/config` | Client configuration |
| `GET /api/debug` | Check all bindings |
| `GET /events` | Server-Sent Events stream |

## Setup

```bash
# 1. Create Cloudflare resources
npx wrangler d1 create skybox-boxdox-db
npx wrangler vectorize create skybox-boxdox-vectors --dimensions 768
npx wrangler r2 bucket create skybox-boxdox-content

# 2. Configure wrangler.toml with resource IDs
cp wrangler.toml.example wrangler.toml
# Edit: fill in database_id, bucket name, etc.

# 3. Set secrets
npx wrangler secret put VOWEL_APP_ID

# 4. Seed content
# Place BoxLang docs content in the content/ directory
bash upload-content.sh --execute

# 5. Build and deploy
npm run build
npm run deploy
```

## Build

```bash
npm run build
```

The `build-multi.sh` script:
1. Applies vendor patches to the MatchBox runtime
2. Concatenates BoxLang sources from `src/listeners/`
3. Builds the React frontend with Vite
4. Copies documentation content to `dist/assets/content/`
5. Generates `nav-tree.json` from the content directory
6. Runs the standard SkyBox build pipeline
7. Generates a symlink for `wrangler dev`

## Dev

```bash
npm run dev
```

This runs the build and starts `wrangler dev --local`.
