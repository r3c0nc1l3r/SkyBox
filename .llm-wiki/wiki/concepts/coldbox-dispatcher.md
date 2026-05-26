---
type: concept
domain: engineering
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# ColdBox Dispatcher

The ColdBox Dispatcher (`coldbox.system.web.Controller.processRequest()`) is the central request lifecycle coordinator in [[entities/coldbox]]. It is the primary component currently missing from [[entities/matchbox]].

## Request Lifecycle

1. **SES Router** resolves URL → handler/action pair
2. **Interceptor preProcess** fires
3. **Event handler action** executes (populates RC/PRC)
4. **View rendering** occurs via `event.setView()`
5. **Interceptor postProcess** fires
6. **Response** is sent to client

## Current MatchBox Equivalent

MatchBox dispatches HTTP requests via `vm_on_http_request()` → `listener.onHttpGet(requestStruct)` returning `{status, headers, body}`. This is a raw listener pattern with no framework lifecycle, interceptors, or request context scopes.

## What Would Be Needed

A ColdBox Controller Shim that runs the ColdBox dispatch lifecycle using MatchBox's request struct instead of Servlet request/response. This is the largest single component needed for ColdBox compatibility.

## Related

- [[entities/coldbox]]
- [[entities/matchbox]]
- [[syntheses/skybox-ecosystem-compatibility-roadmap]]
