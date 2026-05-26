---
type: entity
category: project
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# WireBox

WireBox is the **Dependency Injection and Aspect-Oriented Programming (AOP) framework** from [[entities/ortus-solutions]]. It is the standard DI container for [[entities/boxlang]] and [[entities/coldbox]] applications.

## Core Features

- **Binder DSL** — Declarative mapping configuration for object construction and wiring
- **Annotation-based injection** — `property name="x" inject="y"` convention
- **Scope management** — Singleton, session, request, prototype scopes
- **AOP** — Method interception via mixins and aspect listeners
- **Factory mappings** — DSL for complex object construction
- **Object listeners** — Event-driven extension via interceptors

## Current Status on MatchBox

**Not supported.** [[entities/matchbox]] has zero DI infrastructure. BIFs are plain Rust functions registered in a HashMap. Modules are compile-time config with no service resolution.

## What Would Be Needed

A **WireBox Lite** — a DI container compatible with WireBox's Binder DSL, annotation-based injection, and scope management, implemented in pure [[entities/boxlang]] or Rust.

## Related

- [[concepts/wirebox-di-container]]
- [[concepts/compile-time-module-system]]
- [[concepts/bif-registration-rust-based]]
