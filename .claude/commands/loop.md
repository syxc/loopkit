---
description: Run one approved acceptance-gated task with persisted progress and bounded attempts.
argument-hint: "[--resume] [--task path]"
allowed-tools: Read, Bash(./run.sh:*)
---

# /loop

Read `AGENTS.md`, the approved task and `docs/portability.md`. Run `./run.sh` for a new clean task or `./run.sh --resume` for saved state. Use the original `--task` path when set. Never remove blockers or stale locks automatically, silently reset state, or raise active limits. If no approved executable acceptance exists, stop and use `/spec`.

Report the actual exit and evidence, not model done text. Exit zero requires executable checks and a fresh static verdict tied to the unchanged candidate. Leave changes uncommitted. Human authorization is still required for paid calls, tool permissions, commits and external actions.
