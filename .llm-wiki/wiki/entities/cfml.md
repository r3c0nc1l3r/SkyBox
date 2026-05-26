---
type: entity
category: product
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# CFML

CFML (ColdFusion Markup Language) is the **legacy tag-based and script-based language** that predates [[entities/boxlang]]. It was originally developed by Adobe (ColdFusion) and later by Lucee. [[entities/ortus-solutions]] created [[entities/boxlang]] as its modern successor.

## Key Characteristics

- **Dual syntax**: Tag-based (`<cfoutput>`, `<cfquery>`, `<cfloop>`) and script-based (`<cfscript>`)
- **File extensions**: `.cfc` (components), `.cfm` (pages)
- **`Application.cfc`** lifecycle with event handlers (`onApplicationStart`, `onRequest`, etc.)
- **`this.mappings`** for component path resolution
- **`createObject("java", ...)`** for Java interop
- **Custom tags** (`<cf_myTag>`) for reusable components

## Current Status on MatchBox

**Not supported.** [[entities/matchbox]] cannot parse, compile, or run any CFML code:
- No CFML/CFC/CFM parser (only `.bx`/`.bxs` syntax)
- No tag-based CFML support
- No runtime behavior shims (null handling, type coercion, query compat)
- No `Application.cfc` lifecycle
- No `createObject("java", ...)` (JNI disabled)
- No file I/O, no `cfthread`, no datasource configuration

## What Would Be Needed

A **Rust-based CFML parser** and runtime behavior shims — multi-month effort comparable to the MatchBox compiler itself.

## Related

- [[entities/boxlang]]
- [[concepts/cfml-compatibility]]
- [[concepts/compile-time-module-system]]
