---
type: entity
category: project
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# ColdBox

ColdBox is the **HMVC (Hierarchical Model-View-Controller) web framework** from [[entities/ortus-solutions]]. It is built on top of [[entities/boxlang]] (and previously CFML/[[entities/cfml]]).

## Core Architecture

ColdBox routes all requests through `coldbox.system.web.Controller` which coordinates:
- **Event Handlers** — Action-based request handlers
- **Interceptors** — Event-driven lifecycle hooks (`preProcess`, `postProcess`, etc.)
- **Modules** — Self-contained sub-applications with handlers, models, interceptors, views
- **Views/Layouts** — Convention-based template rendering via `event.renderView()`
- **SES Router** — URL-to-handler routing (`/handler/action/param`)

## Dependencies

ColdBox depends on the full Ortus ecosystem:
- **[[entities/wirebox]]** — Dependency injection and AOP (used everywhere via `property name="x" inject="y"`)
- **[[entities/cachebox]]** — Caching framework
- **[[entities/logbox]]** — Logging framework
- **[[entities/testbox]]** — Testing framework
- **`Application.cfc`** — Application bootstrap (datasources, mappings, settings)

## Current Status on MatchBox

**Not supported.** [[entities/matchbox]] lacks every component needed:
- ❌ No ColdBox Dispatcher
- ❌ No [[concepts/wirebox-di-container]]
- ❌ No Interceptor Chain
- ❌ No Request Context (RC/PRC)
- ❌ No SES URL Routing
- ❌ No View Rendering
- ❌ No Module System (ColdBox-style)
- ❌ No Application lifecycle

## What Would Be Needed

Seven major components would need to be implemented as pure [[entities/boxlang]] or Rust shims, estimated as a **very large effort**.
