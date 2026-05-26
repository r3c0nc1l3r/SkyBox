---
type: entity
category: project
created: 2026-05-26
updated: 2026-05-26
sources: [sources/SRC-2026-05-26-001]
---

# BoxLang

BoxLang is the **modern JVM-based programming language** owned and directed by [[entities/ortus-solutions]]. It is the successor language to [[entities/cfml]] (ColdFusion Markup Language) and serves as the foundation for the entire Ortus ecosystem ([[entities/coldbox]], [[entities/wirebox]], [[entities/cachebox]], [[entities/logbox]], [[entities/testbox]], [[entities/commandbox]]).

## Multi-Runtime Architecture

BoxLang supports multiple runtimes:
- **JVM BoxLang** — Full-featured runtime with Java interop, dynamic module loading, interceptors, and all bx-* modules
- **[[entities/matchbox]]** — Rust-based native implementation targeting WASM, CLI, JS, and embedded (ESP32)

## Key Differences Between JVM and MatchBox

| Feature | JVM BoxLang | MatchBox WASM |
|---------|-------------|---------------|
| BIF registration | Java annotations (`@BoxBIF`) | Rust `HashMap<String, BxNativeFunction>` |
| Module loading | Dynamic (JAR scanning) | Compile-time only |
| Interceptors | Full InterceptorService | ❌ None |
| DI | WireBox | ❌ None |
| JNI | Full | ❌ Disabled for WASM |
| CFML parsing | JVM transpiler | ❌ Not supported |

## Related

- [[entities/matchbox]]
- [[entities/cfml]]
- [[concepts/compile-time-module-system]]
- [[concepts/cfml-compatibility]]
