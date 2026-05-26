---
type: concept
domain: engineering
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# CFML Compatibility

The set of features needed to run legacy [[entities/cfml]] (ColdFusion Markup Language) code — `.cfc` and `.cfm` files — on non-JVM runtimes like [[entities/matchbox]].

## Current State in JVM [[entities/boxlang]]

The `bx-compat-cfml` module provides:
- **CFML→BoxLang transpiler** — Converts CFML source to BoxLang AST at runtime (Java/ANTLR)
- **Null handling** — `nullIsUndefined` mode via interceptors
- **Type coercion** — `booleansAreNumbers`, string-to-number behaviors
- **Query compat** — Lucee-style query object behavior
- **JSON parsing** — Lenient mode (single quotes, non-standard dates)
- **Server scope seeding** — CFML-style server scope
- **Uppercase keys** — Auto-uppercasing struct/query column keys
- **`force output=true`** — Default output buffer behavior

## Current State in MatchBox WASM

**Not supported.** Gap is critical across multiple dimensions:

| Layer | Status | Why |
|-------|--------|-----|
| CFML parser | ❌ | MatchBox parser only handles `.bx`/`.bxs` syntax |
| Tag-based CFML | ❌ | No tokenizer or AST node types for `<cf*>` tags |
| Runtime shims | ❌ | Entire `bx-compat-cfml` is JVM interceptor-based |
| Application.cfc lifecycle | ❌ | No app lifecycle events in MatchBox |
| `cfscript` dialect | ⚠️ Partial | Minimal patches in compiler, not comprehensive |

## What Would Be Needed

1. **Rust-based CFML parser** — Port the Java transpiler to Rust (multi-month effort)
2. **Runtime behavior shims** — Port `bx-compat-cfml` interceptors to Rust/WASM
3. **Tag-to-AST compilation** — Each CFML tag needs a BoxLang AST node or compiled function
4. **`Application.cfc` shim** — Lifecycle events mapped to MatchBox init/handler pattern
5. **Compatibility BIFs** — Case-insensitive name resolution, CFML-expected signatures

## Recommended Hybrid Approach

Pre-compile `.cfc`/`.cfm` files to `.bxs` during the build phase rather than trying to interpret them at runtime. This avoids the parser dependency at runtime but requires a build step.

## Related

- [[entities/cfml]]
- [[entities/boxlang]]
- [[entities/matchbox]]
- [[concepts/compile-time-module-system]]
