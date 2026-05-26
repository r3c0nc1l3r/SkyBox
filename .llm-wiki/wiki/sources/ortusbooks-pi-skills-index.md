---
type: source
title: "Skills index + MCP caching in ortusbooks-pi"
slug: ortusbooks-pi-skills-index
status: insight
created: 2026-05-26
updated: 2026-05-26
---
# Skills index + MCP caching in ortusbooks-pi
Added hybrid search to the [[entities/ortus-solutions]] docs pi extension. Three skill repos (Ortus-Solutions/skills, ortus-boxlang/skills, ColdBox/skills) are shallow-cloned to `~/.ortusbooks-pi/skills/` on startup. An in-memory FTS inverted index over ~241 SKILL.md files provides fast offline search before falling back to GitBook MCP endpoints. MCP responses are cached with a 5-minute TTL via the new `TTLCache` class. New slash command `/ortusbooks-pi:update-skills` refreshes repos and rebuilds the index. Files: `skills-repo.ts`, `skills-index.ts`, `cache-manager.ts`.
---
*Captured: 2026-05-26*
## Related
_Add links to related pages._