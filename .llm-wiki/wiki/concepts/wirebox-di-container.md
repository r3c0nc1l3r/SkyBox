---
type: concept
domain: engineering
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# WireBox DI Container

WireBox is the Dependency Injection and AOP framework from [[entities/ortus-solutions]], used throughout the [[entities/coldbox]] ecosystem. Understanding its architecture is essential for planning a matchBox-compatible alternative.

## Core Features

- **Binder DSL** — Declarative object mapping via `map("alias").to("full.path")` or `toClass("path")` or `toFactoryMethod("factory", "method")`
- **Annotation-based injection** — `property name="x" inject="id:alias"` or `inject="model:UserService"` with autodiscovery by convention
- **Scope management** — `singleton` (one instance), `prototype` (new each time), `session` (per user session), `request` (per HTTP request), `application` (app-wide)
- **AOP** — Method interceptor mixins via `around` advice with lifecycle hooks
- **Factory DSL** — `inject="wirebox:entityService"` for built-in service injection, `inject="coldbox:flash"` for ColdBox services
- **Object event listeners** — `preInit`, `postInit`, `preInject`, `postInject`, `afterInstanceCreated` event hooks

## Current Status in MatchBox

**None.** The MatchBox runtime has zero DI infrastructure. BIFs are plain Rust functions. Modules are compile-time config. There is no service registry, no injection resolution, no scope management.

## MatchBox Equivalent

A "WireBox Lite" would need:
- A **service registry** mapping names to factory functions
- **Injection resolution** — Injecting named services into class instances via metadata
- **Scope management** — Singleton cache, prototype factory, request scope
- **AOP hooks** — Method interception (technically feasible via Rust closures)

## Priority

**P2** — Needed before ColdBox can run, but the extension architecture (P1) should come first.

## Related

- [[entities/wirebox]]
- [[entities/coldbox]]
- [[entities/matchbox]]
- [[concepts/compile-time-module-system]]
