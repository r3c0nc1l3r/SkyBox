# matchbox-cf-worker — BoxLang WebSockets on Cloudflare Workers

Run [SocketBox-style](https://github.com/ortus-solutions/matchbox) BoxLang
WebSocket applications on **Cloudflare Workers + Durable Objects** with near-zero
cold start, automatic hibernation, and full access to the Hibernation WebSocket API.

## Prerequisites

- **Rust** (nightly) with `wasm32-unknown-unknown` target
- **wasm-bindgen** CLI v0.2.114 (`cargo install wasm-bindgen-cli --version 0.2.114`)
- **Node.js** 18+ with **npm** (for `wrangler` and `workerd`)
- **wrangler** (`npx wrangler`) — for dev and deploy to Cloudflare
- **workerd** (`npx workerd`) — for local testing without Cloudflare account

## Quick Start

### 1. Write a BoxLang WebSocket Listener

```boxlang
// EchoListener.bx
class EchoListener {
    function onConnect(required channel) {
        channel.sendMessage("Welcome to Echo!");
    }
    function onMessage(required message, required channel) {
        channel.sendMessage("echo:" & message);
    }
    function onClose(required channel) {}
}
```

### 2. Build the WASM worker

```bash
bash crates/matchbox-cf-worker/examples/build.sh \
    examples/myapp \
    examples/myapp/EchoListener.bx \
    EchoListener
```

This runs the full pipeline: `cargo build --target wasm32 → wasm-bindgen → cf-worker-builder (embed BoxLang bytecode)`.

### 3. Test locally with workerd

Create `test_myapp.capnp` and `test_myapp.js`, then:

```bash
npx workerd serve test_myapp.capnp
curl http://localhost:8787/
```

### 4. Deploy to Cloudflare

```bash
cd examples/myapp
npx wrangler deploy
```

## Project Structure

```
crates/matchbox-cf-worker/
├── Cargo.toml                 # Crate config (cdylib + rlib, WASM target)
├── README.md                  # This file
├── AGENTS.md                  # Developer conventions & BIF constraints
├── src/
│   ├── lib.rs                 # Public module declarations
│   ├── types.rs               # Core types (WebSocketConfig, RequestData, CalloutMessage)
│   ├── channel.rs             # CfWebSocketChannelObject (BxNativeObject impl)
│   ├── do_adapter.rs          # DoState + CalloutBridge implementations
│   ├── wasm_exports.rs        # #[wasm_bindgen] exports
│   └── wasm_metadata.rs       # WASM custom section read/write
├── shell/
│   ├── mcf-worker.js          # Cloudflare Worker + DO entry point
│   └── wrangler.toml          # Template wrangler config
├── examples/
│   ├── build.sh               # Full build pipeline script
│   ├── run-workerd-test.sh    # Run all workerd integration tests
│   ├── echo/                  # Basic echo server
│   ├── counter/               # Stateful counter (demoes DO state persistence)
│   ├── chatroom/              # Multi-client chat with broadcast
│   ├── moonphase/             # Moon phase calculator (JSON responses)
│   ├── romannumeral/          # Roman numeral converter
│   ├── jsonfmt/               # JSON validator (manual parsing, no deserializeJSON)
│   ├── textanalyzer/          # Word/sentence frequency analyzer
│   └── todo/                  # Collaborative todo list
├── samples/                   # Reference BoxLang listener snippets
└── tests/
    └── websocket_test.rs      # Rust-native test suite
```

## Demos

All demos are tested end-to-end under `workerd`. Each has automated tests in its directory.

| Demo | Description | Commands | Test |
|------|-------------|----------|------|
| **echo** | Basic echo server | anything | manual |
| **counter** | Stateful click counter | `increment`, `view` | `OK: all infra tests passed` |
| **chatroom** | Multi-client chat | `msg:text`, `nick:name` | `OK: state keys=messages,room,usercount,users` |
| **moonphase** | Moon phase calculator | `now`, `list`, `help` | `OK: phase=Waxing Crescent ill=10 list=8` |
| **romannumeral** | Roman↔integer converter | `toint MMXXV`, `sort III,II,IV,IX` | `OK: toint=2025, sort=II,III,IV,IX` |
| **jsonfmt** | JSON structural validator | `validate {...}`, `count [...]` | `OK: valid=true invalid=false` |
| **textanalyzer** | Word/sentence/text analysis | `analyze TEXT`, `words TEXT` | `OK: words=4 freq=hello` |
| **todo** | Collaborative todo list | `add task`, `done 1`, `del 1`, `list`, `clear` | `OK: add+list+done passed` |

## Build Pipeline

```
┌──────────────┐    ┌───────────────┐    ┌────────────────────┐
│  BoxLang .bx │───▶│  cf-worker-   │───▶│  dist/worker.wasm  │
│  source code │    │  builder      │    │  (custom sections) │
└──────────────┘    │  (CLI)        │    └────────────────────┘
                    │               │
┌──────────────┐    │  Compiles BX, │    ┌────────────────────┐
│  Rust WASM   │───▶│  serializes   │───▶│  skybox:chunk      │
│  (cargo)     │    │  bytecode,    │    │  (BoxLang bytecode)│
└──────────────┘    │  embeds into  │    └────────────────────┘
                    │  WASM custom  │    ┌────────────────────┐
┌──────────────┐    │  sections     │───▶│  skybox:ws_config  │
│  wasm-       │───▶│               │    │  (JSON config)     │
│  bindgen     │    └───────────────┘    └────────────────────┘
└──────────────┘
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Worker fetch()                                              │
│  ─── validates Upgrade: websocket header                     │
│  ─── routes to DO via idFromName("default")                  │
└──────────────────────┬───────────────────────────────────────┘
                       │ WebSocketPair
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Durable Object: MatchBoxWebSocketDO                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  BoxLang VM (single, shared across all connections)   │    │
│  │  ┌────────────────────────────────────────────────┐   │    │
│  │  │ Listener instance (your class)                  │   │    │
│  │  │  variables.state = shared across ALL WS conns   │   │    │
│  │  └────────────────────────────────────────────────┘   │    │
│  │                                                       │    │
│  │  CfWebSocketChannelObject (per-connection):           │    │
│  │  • sendMessage / sendJson / sendBytes                 │    │
│  │  • broadcastMessage / broadcastJson / broadcastBytes  │    │
│  │  • close, getId, getPath, getUrl, getHTTPHeader       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  DO Storage (SQLite, survives hibernation):                  │
│  • "listener_state" → { count: 3 }                           │
│  • "connections" → { conn-uuid: { path, headers } }         │
│                                                              │
│  WebSocket connections (up to 32,768 per DO):                │
│  ┌──────┐ ┌──────┐ ┌──────┐   ← ctx.getWebSockets()         │
│  │conn1 │ │conn2 │ │conn3 │                                 │
│  └──────┘ └──────┘ └──────┘                                 │
└──────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### One DO per app, not per connection
Unlike naive implementations that create one Durable Object per WebSocket
connection, this adapter uses **one DO per app** sharing a single BoxLang VM.
This matches how the native MatchBox server works (one thread, one VM,
`HashMap<id, Sender>` for broadcast).

### Hibernation API (not the standard WebSocket API)
The DO uses `ctx.acceptWebSocket(server)` instead of
`server.accept()`. This allows the DO to **hibernate** when idle — clients
stay connected but the DO is evicted from memory. No billable duration
accrues until the next message arrives.

### Broadcast via getWebSockets()
Broadcast iterates `ctx.getWebSockets()`, the native DO way to
find all connected WebSockets.

### Async Pause/Resume Cycle
Since the BoxLang VM runs synchronously on WASM but needs to call async
Cloudflare APIs (D1, Vectorize, Workers AI), the system uses a pause/resume
cycle:

```
BoxLang BIF call → VM yields {__paused__: true, ops: [{async_id, ...}]}
                → JS shell awaits the promise
                → vm_complete_async(JSON.stringify(results)) resumes VM
                → VM continues with the async result
```

This is handled in `mcf-worker.js` for `onConnect`, `onMessage`, and
`onHttpGet` — each method has a `while (result.__paused__ && result.ops)`
loop that resolves pending async operations and resumes the VM.

### Binding Call Dispatch
Cloudflare-specific BIFs (`d1Query`, `d1Execute`, `mxaiEmbed`,
`mxaiVectorizeUpsert`, `mxaiVectorizeQuery`, `openRouterChat`,
`tursoQuery`, `tursoExecute`) are routed through a single
`__skybox_binding_call` global handler. The DO's `handleBindingCall()`
dispatches to the appropriate Cloudflare binding based on the `action`
field. Async operations return a Promise stored in `pendingAsyncOps` by
`async_id`, which the pause/resume loop resolves.

### SSE Architecture
The JS shell supports two SSE stream patterns:

1. **Module-level SSE streams** (default in `shell/mcf-worker.js`):
   A `globalSSEStreams` Map at module scope is shared between the Worker
   entry point and DO callouts. In workerd, the Worker and DO share the
   module scope, so both can access the same Map.

2. **DO-level SSE streams** (used in production examples like boxdox):
   SSE streams live on `this.sseStreams` inside the DO instance. The
   `__skybox_send` callout first tries SSE, then falls back to WebSocket.

Both patterns use the EventSource protocol (`text/event-stream`) with
custom event types (e.g., `ai_chunk`, `user_msg`, `rag_debug`).

## Listener API

### Required methods

```boxlang
class MyListener {
    function onConnect(required channel) { }
    function onMessage(required message, required channel) { }
    function onClose(required channel) { }
}
```

### Channel Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `sendMessage` | `sendMessage(text)` | Send a text message to this connection |
| `sendText` | `sendText(text)` | Alias for sendMessage |
| `sendJson` | `sendJson(value)` | Serialize a value to JSON and send as text |
| `sendBytes` | `sendBytes(bytes)` | Send binary data to this connection |
| `broadcastMessage` | `broadcastMessage(text)` | Send text to all connections except sender |
| `broadcastText` | `broadcastText(text)` | Alias for broadcastMessage |
| `broadcastJson` | `broadcastJson(value)` | Serialize to JSON and broadcast |
| `broadcastBytes` | `broadcastBytes(bytes)` | Broadcast binary data |
| `close` | `close([code[, reason]])` | Close this connection |
| `getId` | `getId()` | Return this connection's unique ID |
| `getPath` | `getPath()` | Return the request path |
| `getUrl` | `getUrl()` | Return the full request URL |
| `getHTTPHeader` | `getHTTPHeader(name[, default])` | Get an HTTP header value |

## Creating a New Project

```bash
# 1. Create example directory
mkdir -p examples/myapp
cd examples/myapp

# 2. Write your listener
cat > MyListener.bx << 'EOF'
class MyListener {
    function onConnect(required channel) {
        channel.sendJson({"type":"welcome","service":"My App"});
    }
    function onMessage(required message, required channel) {
        channel.sendMessage("You said: " & message);
    }
    function onClose(required channel) {}
}
EOF

# 3. Copy shell files
cp ../../shell/mcf-worker.js ./
cp ../../shell/wrangler.toml ./

# 4. Create package.json
cat > package.json << 'EOF'
{
  "name": "skybox-app",
  "scripts": {
    "build": "bash ../build.sh . MyListener.bx MyListener",
    "test:workerd": "node test_myapp.js",
    "dev": "npx wrangler dev --port 8787 --local",
    "deploy": "npx wrangler deploy"
  }
}
EOF

# 5. Build
npm run build

# 6. Dev
npm run dev
```

## Wrangler Configuration

```toml
name = "skybox-app"
main = "mcf-worker.js"
compatibility_date = "2025-01-01"
account_id = "your-account-id"

[[durable_objects.bindings]]
name = "WEBSOCKET_DO"
class_name = "MatchBoxWebSocketDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["MatchBoxWebSocketDO"]
```

> **Note**: The WASM module is imported via ES module import in `mcf-worker.js`:
> ```js
> import wasmModule from './worker.wasm';
> ```
> On first `wrangler dev`, create a symlink so wrangler can resolve the import:
> ```bash
> ln -sf dist/worker.wasm worker.wasm
> ```

## WASM BIF Limitations

BoxLang on the `wasm32-unknown-unknown` target has limited BIF support.
The following BIFs are **not available**:

| Unavailable BIF | Alternative |
|----------------|-------------|
| `deserializeJSON` | Manual structural validation (see jsonfmt demo) |
| `int(string)` | Compare as strings: `id & "" == "1" & ""` |
| `val(string)` | Avoid string-to-number conversion |
| `asc(char)` | Character comparison: `c >= "0" && c <= "9"` |
| `chr(num)` | N/A |
| `dateFormat`, `parseDateTime` | N/A |
| `year`, `month`, `day` | N/A |
| `pi`, `sin`, `abs` | Compute manually: `if (x < 0) x = 0 - x` |
| `reReplace` | Manual character filtering (see textanalyzer demo) |
| `replace` | Manual iteration (see textanalyzer demo) |

## Variable Persistence

Class-level `variables.xxx` state is shared across ALL WebSocket connections.
State is persisted to DO storage after each `onMessage` call. On hibernation
wake, state is restored via `$text{storage.get('listener_state')}`.

**Important**: Class-level variable initialization does NOT persist across
DO restarts on WASM. Always use the lazy-init pattern:

```boxlang
// DO this:
variables.visits = (variables.visits ?: 0) + 1;

// NOT this:
variables.romanMap = {"I": 1, "V": 5};  // won't persist!
```

For initial state, use a `state.json` file in your example directory and
pass it to the build script:

```bash
bash examples/build.sh examples/myapp examples/myapp/MyListener.bx MyListener \
    "" examples/myapp/state.json
```

Example `state.json`:
```json
{"seeded": false, "docCount": 0}
```

## JS Shell: Key Patterns

### Two-File Copy Issue

There are two copies of `mcf-worker.js`:
1. **Template**: `crates/matchbox-cf-worker/shell/mcf-worker.js` (canonical source)
2. **Per-demo copy**: `examples/<demo>/mcf-worker.js` (used by wrangler)

Always copy the template to the demo after editing:
```bash
cp -f crates/matchbox-cf-worker/shell/mcf-worker.js examples/<demo>/mcf-worker.js
```

For per-demo templates, copy the canonical shell template:
```bash
cp -f crates/matchbox-cf-worker/shell/mcf-worker.js examples/<demo>/mcf-worker.js
```

### Wrangler v4 Deploy Flow

In wrangler v4, `wrangler deploy` only uploads a new version but does NOT
switch traffic. You must use versions:

```bash
npm run build
npx wrangler versions upload
npx wrangler versions deploy --version-id <id> --percentage 100
```

Use `npx wrangler versions list` to find available version IDs.

### WASM Module Import

Do NOT add `[wasm_modules]` to `wrangler.toml`. The WASM is imported
natively via ES module import:

```js
import wasmModule from './worker.wasm';
```

On first `wrangler dev`, create a symlink so wrangler can resolve:
```bash
ln -sf dist/worker.wasm worker.wasm
```

## Testing

### Workerd (no Cloudflare account needed)

Each example has a workerd capnp config and a test JS file. Run individual tests:

```bash
# Start workerd
cd examples/moonphase
npx workerd serve test_moonphase.capnp

# In another terminal
curl http://localhost:8790/
```

### Wrangler dev

```bash
cd examples/moonphase
npx wrangler dev --port 8787 --local
# Connect via WebSocket:
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8787/');
ws.on('message', d => console.log(d.toString()));
ws.on('open', () => ws.send('now'));
"
```

### WebSocket Test Client

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c ws://localhost:8787/ws

# Send messages
> hello
< echo:hello
```

## Limits & Constraints

| Constraint | Value | Notes |
|-----------|-------|-------|
| Max WS per DO | 32,768 | Hard limit from Hibernation API |
| Memory per DO | 128 MB | Shared between VM + connections |
| DO storage ops | 1,000/sec | Limit `storage.put()` calls |
| WS message size | 1 MB | Hard limit from Workers |
| Attachment size | 2,048 bytes | `serializeAttachment` limit |
