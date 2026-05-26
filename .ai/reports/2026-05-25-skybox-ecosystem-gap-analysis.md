# SkyBox Gaps & Deficiencies Analysis

> Generated: 2026-05-25
> Author: ortus-scholar subagent
> Sources: Direct codebase analysis + BoxLang/ColdBox/WireBox/compat-cfml Ortus documentation (official MCP endpoints)

---

## 1. Running a ColdBox Project on Cloudflare Workers

### 1.1 Current State

**What exists:**
- The `matchbox-cf-worker` crate hosts a BoxLang VM inside a Cloudflare Workers Durable Object (DO) with the Hibernation WebSocket API.
- HTTP requests are dispatched via `vm_on_http_request()` → `listener.onHttpGet(requestStruct)` returning `{status, headers, body}`.
- WebSocket connections are handled via `onConnect`, `onMessage`, `onClose` lifecycle methods.
- The runtime supports a single listener class (configured as `listener_class` in `WebSocketConfig`) with a fixed set of entry points.
- A Phase 3 roadmap exists (`.ai/plans/cloudflare-workers/07-ROADMAP.md`) describing future file-based routing and ColdBox-style app server support.
- The `build.rs` has a `Webroot` mode that reads `boxlang.json` for websocket configuration.

**Source:** `crates/matchbox-cf-worker/src/do_adapter.rs`, `crates/matchbox-cf-worker/shell/mcf-worker.js`, `.ai/plans/cloudflare-workers/02-RUNTIME-ADAPTER.md`, `.ai/plans/cloudflare-workers/07-ROADMAP.md`

### 1.2 Critical Gaps

| Gap | Impact | Severity | Details |
|-----|--------|----------|---------|
| **No ColdBox Dispatcher** | ColdBox apps cannot run at all | 🔴 Critical | ColdBox routes all requests through `coldbox.system.web.Controller` which dispatches to event handlers. The MatchBox runtime has no concept of ColdBox's event-driven lifecycle. |
| **No WireBox DI** | No dependency injection | 🔴 Critical | ColdBox apps depend entirely on WireBox for: `property name="x" inject="y"`, AOP, scope management, factory mappings. MatchBox has zero DI infrastructure. |
| **No Interceptor Chain** | No framework event model | 🔴 Critical | ColdBox interceptors (preProcess, postProcess, etc.) are the backbone of ColdBox modules. No interceptor registration or event broadcasting exists. |
| **No Request Context (RC/PRC)** | No request/private scopes | 🔴 Critical | Every ColdBox handler expects `rc` (request collection) and `prc` (private request collection). MatchBox passes a raw struct with request metadata. |
| **No SES URL Routing** | No named routes | 🔴 High | ColdBox uses `/handler/action/params` URL routing via `coldbox.system.interceptors.SES`. The roadmap mentions file-based routing (Phase 3) but it's not implemented. |
| **No Module System (ColdBox-style)** | No module composition | 🔴 High | ColdBox modules (`modules/`) have their own handlers, models, interceptors, views. MatchBox has a BoxLang module system (compile-time only) that is completely different from ColdBox modules. |
| **No View/Layout Rendering** | No HTML output | 🟡 Medium | ColdBox apps render views via `event.renderView()`, `event.setView()`, layouts. MatchBox returns raw `{status, headers, body}` structs. |
| **No Application.cfc Support** | No app bootstrap | 🟡 Medium | ColdBox apps define `this.name`, datasources, mappings, and framework settings in `Application.cfc`. MatchBox uses `boxlang.json` or script API. |
| **No CacheBox Integration** | No caching | 🟡 Medium | CacheBox is a first-class ColdBox citizen. Not available in MatchBox. |
| **No LogBox Integration** | No logging | 🟡 Medium | LogBox appenders configured per ColdBox app. Not available in MatchBox (only `console.log` via JS bridge). |
| **No Scheduled Tasks** | No cron | 🟡 Medium | ColdBox `this.scheduledTasks` and CronBox. The roadmap lists cron triggers as Phase 5. |
| **No ColdBox Module Ecosystem** | No `cborm`, `cbsecurity`, etc. | 🟡 Medium | The entire ForgeBox ecosystem of ColdBox modules is incompatible — they all depend on WireBox, Interceptors, and the ColdBox controller. |
| **No `getInstance()` or DI** | No service injection | 🟡 Medium | ColdBox's `getInstance()` delegates to WireBox. No equivalent exists in MatchBox. |

### 1.3 What Would Be Needed

To run a ColdBox application on Cloudflare Workers via MatchBox, the following would need to be implemented (estimated effort: very large):

1. **ColdBox Controller Shim** — A minimal `coldbox.system.web.Controller` that runs the ColdBox dispatch lifecycle (`processRequest()`) using MatchBox's request struct instead of Servlet request/response.
2. **WireBox Lite** — A DI container compatible with WireBox's Binder DSL, annotation-based injection, and scope management, implemented in pure BoxLang or Rust.
3. **Interceptor Chain** — Event registration and broadcasting matching ColdBox's interceptor execution order.
4. **SES Router** — URL-to-handler resolution with `:param` segments and named routes.
5. **Request Context** — `rc`/`prc` scopes with event-specific data and view rendering state.
6. **View Rendering** — A ColdBox-compatible view renderer (Convention-based + layouts).
7. **Module Loading** — Support for ColdBox module conventions (`ModuleConfig.cfc` with interceptors, handlers, routes).

**Source confidence:** 🟡 Medium — Based on ColdBox documentation and analysis of the MatchBox runtime's capabilities.

---

## 2. Running Legacy CFML (Non-BoxLang) Code

### 2.1 Current State

**What exists:**
- The BoxLang JVM runtime has `bx-compat-cfml` module providing extensive CFML compatibility: null handling, type coercion, server scope seeding, lenient JSON parsing, query behavior matching, CFML→BoxLang transpiler configuration (uppercase keys, force output=true, merge docs into annotations).
- The MatchBox compiler (`vendor/matchbox/crates/matchbox-compiler`) has some BoxLang compatibility features: unqualified method call resolution, `arguments` scope creation, `.bxs`→`.bx` fallback for file extensions.
- The BoxLang project lists "WebAssembly" as a supported runtime in its Multi-Runtime overview.
- BIF stubs exist for unsupported features (JNI returns `Err("Java interoperability is not enabled.")` via `bif-jni` disabled).

**Sources:** BoxLang docs "Compat CFML" page, `vendor/matchbox/crates/matchbox-compiler/src/compiler/mod.rs`, `.ai/plans/cloudflare-workers/03-BIF-COMPATIBILITY.md`

### 2.2 Critical Gaps

| Gap | Impact | Severity | Details |
|-----|--------|----------|---------|
| **No CFML/CFC/CFM Parser** | Traditional CFML cannot be parsed | 🔴 Critical | The MatchBox parser (`matchbox_compiler::parser`) only handles `.bx`/`.bxs` syntax. The CFML transpiler (CFML→BoxLang AST) is part of the JVM `bx-compat-cfml` module, written in Java, and cannot run on WASM. Without a Rust-based CFML parser, no legacy `.cfc`, `.cfm`, or `.cfml` files can be compiled. |
| **No Tag-Based CFML Support** | No `<cf*>` tags | 🔴 Critical | Tags like `<cfoutput>`, `<cfquery>`, `<cfloop>`, `<cfif>`, `<cfset>`, `<cfinclude>`, `<cfmodule>`, `<cffunction>`, `<cfargument>`, `<cfscript>`, `<cfhttp>`, `<cffile>`, `<cfmail>`, `<cfajaxproxy>`, `<cfdiv>`, `<cflayout>` — none exist. The parser has no tokenizer or AST node type for tag-based syntax. |
| **No CFML Transpiler** | No `.cfc` → AST conversion | 🔴 High | The JVM BoxLang `bx-compat-cfml` module contains a transpiler that converts CFML source to BoxLang AST at runtime. This is implemented in Java using ANTLR or similar and cannot run in WASM. |
| **No `bx-compat-cfml` Module for WASM** | No runtime behavior shims | 🔴 High | The entire `bx-compat-cfml` module (interceptors, scope seeding, null handling, type coercion, query compat) is JVM-only. MatchBox has none of these runtime behavior modifications. Even if CFML could be parsed, the runtime behavior would be BoxLang-native, not CFML-compatible. |
| **No `<cfscript>` Dialect Differences** | Script CFML may fail | 🟡 High | CFML `<cfscript>` has differences from BoxLang syntax: `var` scoping, `param` behavior, implicit array/struct creation, `arguments` scope handling, `this` scope differences, `super()` rules. The MatchBox compiler has minimal CFML compatibility patches. |
| **No `Application.cfc` Lifecycle** | No app startup events | 🟡 Medium | CFML apps define `this.mappings`, `this.datasources`, `this.customtagpaths`, `onApplicationStart()`, `onRequest()`, `onRequestEnd()` etc. in `Application.cfc`. None of these lifecycle events exist in MatchBox. |
| **No Custom Tag Support** | No `<cf_*> ` | 🟡 Medium | CFML custom tags (`<cf_myTag>`) and tag-based module loading are not supported. |
| **No `this.mappings`** | No path mappings | 🟡 Medium | CFML apps heavily rely on `this.mappings["/myLib"]` for component resolution. MatchBox has a `bxlang_modules/` convention but no runtime mapping configuration. |
| **No Datasource Configuration** | No database connections | 🟡 Medium | CFML datasources defined in `Application.cfc` or CFAdmin. MatchBox uses D1/Turso bindings via JS callout bridge — completely different model. |
| **No Query Object Compatibility** | `query.column` syntax | 🟡 Medium | CFML query objects are a core data type. MatchBox VM has `query` BIFs but only when `bif-datasource` feature is enabled (not for WASM targets). |
| **No File I/O** | No `fileRead`/`fileWrite` | 🟡 Medium | CFML apps commonly read/write files. MatchBox on Workers has no filesystem. The `bif-io` feature is compile-time disabled for `cf-worker` target. |
| **No Threading (`cfthread`)** | No parallel execution | 🟡 Medium | CFML's `cfthread` tag relies on Java threads. WASM has no OS thread support. MatchBox has cooperative fibers (`runAsync`) but no preemptive threading. |

### 2.3 Compatibility Comparison

| Feature | JVM BoxLang + bx-compat-cfml | MatchBox WASM |
|---------|------------------------------|---------------|
| CFML parsing (`.cfm`/`.cfc`) | ✅ JVM transpiler | ❌ No parser |
| Tag-based CFML | ✅ Transpiled to BoxLang AST | ❌ No support |
| Null handling (nullIsUndefined) | ✅ Interceptor-based | ❌ Not available |
| Type coercion (booleansAreNumbers) | ✅ Interceptor-based | ❌ Not available |
| Query object compat | ✅ Full | ⚠️ Limited (bif-datasource disabled) |
| JSON parsing (lenientJSONParsing) | ✅ Interceptor-based | ❌ Not available |
| Server scope seeding | ✅ Interceptor-based | ❌ Not available |
| Application.cfc lifecycle | ✅ Full | ❌ Not supported |
| Mappings/datasources from Application.cfc | ✅ Full | ❌ Not supported |
| CFML BIF compatibility | ✅ Legacy signatures | ⚠️ Partial (only BoxLang BIFs) |
| `createObject("java", ...)` | ✅ Full JNI | ❌ JNI disabled |
| Custom tags | ✅ Full | ❌ Not supported |
| File I/O | ✅ Full | ❌ Not supported |

### 2.4 What Would Be Needed

To run legacy CFML code on MatchBox/WASM:

1. **CFML Parser in Rust** — Port the CFML transpiler from Java to Rust (or bind to a WASM-compatible parser). This is a major undertaking — CFML has dozens of tag types, complex attribute parsing, nested tag structures, and CFML-specific expression syntax.
2. **CFML Runtime Shims** — Port the `bx-compat-cfml` module's interceptor-based behavior modifications to Rust/WASM: null handling, type coercion, scope seeding, query compat, JSON handling.
3. **Tag-to-AST Compilation** — Each CFML tag needs a corresponding BoxLang AST node or compiled function call.
4. **Application.cfc Shim** — Application lifecycle events mapped to MatchBox's init/handler pattern.
5. **Compatibility BIFs** — Provide CFML-expected BIF signatures (e.g., `arrayLen()` vs `arraylen()`, case-insensitive name resolution).

**Source confidence:** 🔵 High — Based on BoxLang compat-cfml documentation and direct analysis of the MatchBox compiler's parser and VM's BIF system.

---

## 3. Architecture for BIF Registration and Extension Points

### 3.1 Current State

The project has a **two-tier BIF registration system** with a **compile-time module system**:

#### Tier 1: Core VM BIFs (`crates/matchbox-vm/src/bifs/`)

```rust
// File: vendor/matchbox/crates/matchbox-vm/src/bifs/mod.rs
pub fn register_all() -> HashMap<String, BxNativeFunction> { ... }
```

- **~70+ BIFs** registered at VM construction via `new_with_bifs()`:
  - Math: `round`, `int`, `ceiling`, `abs`, `min`, `max`, `randRange`
  - Array: `arrayAppend`, `arrayLen`, `arrayNew`, `arrayPop`, `arrayDeleteAt`, `arrayInsertAt`, `arrayClear`, `arraySet`
  - Struct: `structNew`, `structInsert`, `structUpdate`, `structDelete`, `structKeyExists`, `structGet`, `structKeyArray`, `structClear`, `structCount`
  - String: `len`, `ucase`, `lcase`, `trim`, `toString`, `listToArray`, `listFindNoCase`, `indexOf`, `reMatch`, `mid`, `replace`, `chr`
  - System: `createUUID`, `createGUID`, `getSystemSetting`
  - Date/Time: `now`, `getTickCount`, `sleep`, `yield`
  - IO (feature-gated): `directoryExists`, `fileRead`, `fileWrite`, etc.
  - HTTP (feature-gated): `http`
  - Crypto (feature-gated): `hash`
  - Datasource (feature-gated): `queryExecute`, `transaction*`, etc.
  - CLI (feature-gated): `cliClear`, `cliExit`, etc.
  - ZIP (feature-gated): `extract`
  - JSON: `jsonDeserialize`, `jsonSerialize`, `loadProperties`
  - Async: `runAsync`, `futureOnError`
  - JNI: `createObject("java", ...)` — DISABLED for WASM

**Source:** `vendor/matchbox/crates/matchbox-vm/src/bifs/mod.rs`

#### Tier 2: Cloudflare-Specific BIFs (`crates/matchbox-cf-worker/src/bifs.rs`)

```rust
// File: crates/matchbox-cf-worker/src/bifs.rs
pub fn register_bifs() -> HashMap<String, BxNativeFunction> { ... }
```

- **9 BIFs** registered additionally for Cloudflare bindings:
  - `d1Query`, `d1Execute` → D1 SQLite database
  - `tursoQuery`, `tursoExecute` → Turso (LibSQL) database
  - `openRouterChat` → OpenRouter AI streaming
  - `mxaiEmbed` → Workers AI embeddings
  - `mxaiVectorizeUpsert`, `mxaiVectorizeQuery`, `mxaiVectorizeDeleteByIds` → Vectorize vector database

These BIFs use an **async callout protocol**: Rust VM → JS callout bridge → Cloudflare binding → async result → Rust VM resume.

**Source:** `crates/matchbox-cf-worker/src/bifs.rs`, `crates/matchbox-cf-worker/shell/mcf-worker.js`

#### BoxLang Module System (`vendor/matchbox/src/modules.rs`)

| Source | Priority | Description |
|--------|----------|-------------|
| `box.json` dependencies | 1 (highest) | CommandBox-style package manifest with relative paths or module names |
| `matchbox.toml` modules | 2 | Toml manifest with explicit `[modules.name] path = "..."` entries |
| `modules/` directory | 3 | Directory scan for folders with `ModuleConfig.bx` |
| `boxlang_modules/` directory | 3 | Same as above, alternate directory name |
| `--module <path>` CLI flag | 4 (override) | CLI overrides with same-name replacement |

**Module lifecycle:**
1. `ModuleConfig.bx` is parsed and compiled in an isolated VM at **compile time**
2. `onLoad()` is called
3. `configure()` is called, returning a settings struct
4. BIF sources from `bifs/*.bxs` or `bifs/*.bx` are injected as prelude sources (tree-shaked into final binary)
5. `getModuleSettings(name)` function is auto-generated with baked-in settings
6. Native Rust modules with `matchbox/Cargo.toml` are compiled alongside the VM via the **Native Fusion** system

**Source:** `vendor/matchbox/src/modules.rs`, `vendor/matchbox/tests/modules/greetings/ModuleConfig.bx`, `vendor/matchbox/tests/modules/native-math/ModuleConfig.bx`

#### BoxLang .bx Module Loading (Packages)

In `packages/mx-ai/`:
- `ModuleConfig.bx` with `configure()`, `onLoad()`, `onUnload()` lifecycle
- `bifs/` directory with `*.bx` files containing `@BoxBIF` annotated functions
- These BIFs are loaded at compile time as prelude sources (injected during tree-shaking)

**Source:** `/home/k/Git/SkyBox/packages/mx-ai/ModuleConfig.bx`, `packages/mx-ai/bifs/*.bx`

#### Native Fusion System

Rust crates inside a module's `matchbox/` directory are compiled alongside the VM. The build system:
1. Scans all `.rs` files for `pub fn register_bifs()` and `pub fn register_classes()` 
2. Generates glue code that calls each registration function
3. Links them directly into the final binary

**Source:** `vendor/matchbox/src/lib.rs` lines 1900-2050

### 3.2 Critical Gaps

| Gap | Impact | Severity | Details |
|-----|--------|----------|---------|
| **No Dynamic Runtime Module Loader** | Extensions must be compiled in | 🔴 High | All BIFs and modules must be selected at compile time. There's no runtime module discovery or dynamic loading. ColdBox, by contrast, discovers and loads modules at startup from `modules/` directories. |
| **No Interceptor/Event System** | No extension hooks | 🔴 High | There is no event model for hooking into VM lifecycle (BIF invocation, class creation, etc.). BoxLang JVM has a sophisticated interceptor system (`InterceptorService`). MatchBox has nothing comparable. |
| **No Service Registry / DI** | No inversion of control | 🔴 High | Extensions cannot declare dependencies or receive injection. WireBox provides full DI. MatchBox has no equivalent — BIFs are plain functions, modules are compile-time config. |
| **No Java Interop** | No JVM libraries | 🟡 High | `bif-jni` feature is compile-time disabled for WASM. This blocks all Java-based BoxLang modules (which use `createObject("java", ...)` extensively). |
| **No BoxLang Module Ecosystem Compatibility** | Most bx-* modules incompatible | 🟡 High | Most BoxLang modules (`bx-ai`, `bx-compat-cfml`, `bx-esapi`, `bx-orm`, etc.) depend on JVM features. The only pure-BoxLang modules that could work are those with no Java dependencies. |
| **BoxLang Module ≠ MatchBox Module** | Different conventions | 🟡 Medium | BoxLang JVM modules use `ModuleConfig.bx` with a `class extends="boxlang.runtime.modules.Module"` superclass. MatchBox modules use `ModuleConfig.bx` without any superclass — just class with `configure()`. Different `bifs/` conventions exist too. |
| **No Dynamic BIF Registration** | Can't add BIFs at runtime | 🟡 Medium | BIFs are registered in the `HashMap` at VM construction. There is no `registerBIF(name, function)` API accessible from BoxLang code. All BIFs must be Rust native functions. |
| **No Pure-BoxLang BIF Registration** | BIFs must be Rust or prelude | 🟡 Medium | The `bifs/*.bx` sources in modules are injected at compile time as prelude (tree-shaked BoxLang source), not truly registered BIFs. They appear as global functions but aren't registered in the BIF HashMap. |
| **No CFML-Style Extension Points** | Custom tag paths, CFC mappings | 🟡 Low | CFML has `this.customtagpaths`, `this.mappings`, function imports. None of these runtime extension resolution mechanisms exist in MatchBox. |

### 3.3 Architecture Comparison

| Feature | JVM BoxLang | MatchBox WASM |
|---------|-------------|---------------|
| BIF registration | Java annotations (`@BoxBIF`) + `Module.bx` | Rust `HashMap<String, BxNativeFunction>` |
| Module loading | Dynamic: JAR scanning + `Module.bx` | Compile-time: `box.json`/`matchbox.toml`/directory scan |
| Module lifecycle | `onLoad()`, `onUnload()` at runtime | `onLoad()`, `configure()` at **compile time** only |
| Interceptor/Event system | `InterceptorService` with ordered execution | ❌ None |
| DI container | WireBox (full AOP, scopes, factories) | ❌ None |
| Dynamic BIF registration | `registerBIF()` at runtime | ❌ All compiled in |
| Native code interop | JNI (Java) + Native Fusion (Rust) | Only Native Fusion (Rust) |
| Extension discovery | JAR scanning, `boxlang_modules/` | `modules/`, `boxlang_modules/`, `box.json` |
| Module settings | Runtime `getModuleSettings()` | Baked into bytecode at compile time |
| Pure-BoxLang BIFs | `bifs/*.bx` registered at module load | `bifs/*.bxs` tree-shaked as prelude |

### 3.4 What Would Be Needed

1. **Runtime Module Discovery** — Scan `modules/` or `boxlang_modules/` directories at Worker startup, parse `ModuleConfig.bx` or `ModuleConfig.bxs`, and register BIFs/functions without requiring recompilation.
2. **Dynamic BIF Registration in BoxLang** — A `registerBIF(name, function)` BIF that lets BoxLang code register new BIFs at runtime, enabling dynamic extension loading.
3. **Interceptor/Event Model** — Event hooks around VM lifecycle: `beforeBIFInvocation`, `afterBIFInvocation`, `onModuleLoad`, `onModuleUnload`, `beforeRequest`, `afterRequest`.
4. **Basic DI Container** — A lightweight `getInstance()` / `inject` system modeled on WireBox patterns but implemented in pure BoxLang or Rust.
5. **BoxLang JVM Module Porting Guide** — Document which `bx-*` modules can run on WASM (pure BoxLang) vs which need JVM (most of them).

**Source confidence:** 🔵 High — Direct from codebase analysis (BIF registration, module loading, Native Fusion) and BoxLang documentation.

---

## 4. Cross-Cutting Recommendations

### Priority Order for Addressing Gaps

| Priority | Area | Effort | Business Value |
|----------|------|--------|---------------|
| 🥇 **P1** | Extension architecture (BIF registration, module system, dynamic loading) | Medium | Enables all other ecosystem features |
| 🥇 **P1** | CFML parser + transpiler for `.cfc`/`.cfm` files | Very Large | Enables migration of legacy CFML apps |
| 🥈 **P2** | WireBox-compatible DI container | Large | Enables ColdBox modules and DI-dependent libraries |
| 🥈 **P2** | Runtime behavior shims (null handling, type coercion, query compat) | Large | Required for CFML compatibility |
| 🥉 **P3** | ColdBox Dispatcher + Interceptor Chain | Very Large | Enables full ColdBox HMVC apps |
| 🥉 **P3** | SES Router + View Rendering | Large | Completes ColdBox compatibility |

### Key Insights

1. **The project has a solid low-level foundation** — the VM, BIF registration, async callout bridge, Durable Object integration, and WASM build pipeline are all well-implemented.

2. **The ecosystem gap is the primary limitation** — MatchBox cannot run any ColdBox apps or most `bx-*` modules because they depend on features that only exist in the JVM BoxLang runtime.

3. **The compile-time-only module system is the biggest architectural constraint** — ColdBox and standard BoxLang modules depend on runtime discovery and loading. Changing this would be a fundamental architectural shift.

4. **A Rust-based CFML parser is the single hardest dependency** — The CFML tag language is large and complex. Porting the transpiler would be a multi-month effort comparable to the existing MatchBox compiler.

5. **Hybrid approach (compile-time + runtime) may be most practical** — For CFML compatibility, pre-compile `.cfc`/`.cfm` files to `.bxs` during the build phase rather than trying to interpret them at runtime. For module loading, compile-time dependency resolution with baked-in BIF registration.

---

## Sources

- **Codebase**: `/home/k/Git/SkyBox/` — `crates/`, `vendor/matchbox/`, `packages/`, `.ai/plans/`, `examples/`
- **Ortus Docs**: `boxlang.ortusbooks.com` — WASM Container, Modules, Compat CFML, Multi-Runtime
- **Ortus Docs**: `coldbox.ortusbooks.com` — Interceptors, MVC architecture, Configuration
- **Ortus Docs**: `wirebox.ortusbooks.com` — Configuration, ColdBox Mode Listener
- **Ortus Docs**: `bx-compat-cfml` module documentation
