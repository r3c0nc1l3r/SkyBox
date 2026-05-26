---
type: concept
domain: engineering
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# BIF Registration (Rust-based)

The pattern by which built-in functions (BIFs) are registered in [[entities/matchbox]], using a `HashMap<String, BxNativeFunction>` at VM construction time.

## Current Architecture (Two-Tier)

### Tier 1: Core VM BIFs (`crates/matchbox-vm/src/bifs/`)

~70+ BIFs registered in `register_all()`:
- **Math**: `round`, `int`, `ceiling`, `abs`, `min`, `max`, `randRange`
- **Array**: `arrayAppend`, `arrayLen`, `arrayNew`, `arrayPop`, `arrayDeleteAt`, `arrayInsertAt`, `arrayClear`, `arraySet`
- **Struct**: `structNew`, `structInsert`, `structUpdate`, `structDelete`, `structKeyExists`, `structGet`, `structKeyArray`, `structClear`, `structCount`
- **String**: `len`, `ucase`, `lcase`, `trim`, `toString`, `listToArray`, `listFindNoCase`, `indexOf`, `reMatch`, `mid`, `replace`, `chr`
- **System**: `createUUID`, `createGUID`, `getSystemSetting`
- **Date/Time**: `now`, `getTickCount`, `sleep`, `yield`
- **IO** (feature-gated): `directoryExists`, `fileRead`, `fileWrite`
- **HTTP** (feature-gated): `http`
- **Crypto** (feature-gated): `hash`
- **Datasource** (feature-gated): `queryExecute`, `transaction*`
- **JSON**: `jsonDeserialize`, `jsonSerialize`, `loadProperties`
- **Async**: `runAsync`, `futureOnError`
- **JNI**: `createObject("java", ...)` — DISABLED for WASM

### Tier 2: Cloudflare-Specific BIFs (`crates/matchbox-cf-worker/src/bifs.rs`)

9 BIFs for Cloudflare bindings, using the [[concepts/async-callout-bridge]]:
- `d1Query`, `d1Execute`, `tursoQuery`, `tursoExecute`
- `openRouterChat`, `mxaiEmbed`
- `mxaiVectorizeUpsert/Query/DeleteByIds`

## Key Gap

There is **no dynamic BIF registration API** accessible from [[entities/boxlang]] code at runtime. All BIFs must be Rust native functions registered at VM construction. Pure-BoxLang BIFs (from `bifs/*.bx` in modules) are tree-shaked as prelude source, not registered in the BIF HashMap.

## Comparison with JVM BoxLang

| Feature | JVM BoxLang | MatchBox WASM |
|---------|-------------|---------------|
| BIF registration | Java `@BoxBIF` annotations | Rust `HashMap<String, BxNativeFunction>` |
| Dynamic registration | `registerBIF()` at runtime | ❌ Not possible |
| Pure-BoxLang BIFs | `bifs/*.bx` at module load | `bifs/*.bxs` as prelude source |
| Module BIFs | Loaded via `Module.bx` | Tree-shaked at compile time |

## Related

- [[concepts/compile-time-module-system]]
- [[concepts/native-fusion]]
- [[concepts/async-callout-bridge]]
- [[entities/matchbox]]
