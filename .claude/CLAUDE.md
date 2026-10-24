@../AGENTS.md

# Project: <name>
Stack: <language, framework, db>.
Layout: `src/` (code), `tests/`, `db/migrations/`.

## Commands
- `<run dev>` — local server
- `<run tests>` — test suite
- `<run lint>` — lint/format

## Conventions
- Match the existing code in the file you're editing. Read it before you write.
- One change, one purpose. No "while I was in there".

## Claude-specific

- Slash commands live in `.claude/commands/`. `/spec`, `/verify`, and `/loop` are the primary entry points.
- `/verify` runs the saved candidate through executable acceptance and a separate fresh reviewer adapter. `.claude/agents/verifier.md` is an optional read-only profile, not the runtime gate.
- The optional SessionStart hook (`.claude/hooks/session-start`) can expose skill routing when configured by your client. The runner does not require it or enable external services.
- Cross-agent rules live in the imported `AGENTS.md` at repo root. Do not duplicate them here.

<!-- Keep under 300 lines. Prune weekly. Every paragraph is a tax on every turn. -->
