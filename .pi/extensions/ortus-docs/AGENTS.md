<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker — Ortus Docs Extension

This project uses **bd (beads)** for issue tracking. The database is local to this
extension directory (`ortus` prefix).

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
bd prime              # Full workflow context + session protocol
```

### Spec-Driven Development

This project uses a **spec-first** workflow managed via beads formulas:

```bash
bd mol wisp --formula superpowers --title "..." --var task="..."
```

Each feature starts as a spec (wisp), then gets implemented and closed.
See `.beads/formulas/superpowers.yaml` for the full workflow definition.

### Persistent Memory

```bash
bd remember "insight"          # Store knowledge
bd recall <key>                # Retrieve
bd memories                    # List/search
```

### Key References

- **Plan**: `./PLAN.md` — full architecture and phased build
- **Extension**: `./index.ts` — entry point (Phase 1+)
- **Formulas**: `.beads/formulas/` — workflow definitions
