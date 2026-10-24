---
description: Re-run executable acceptance and a fresh static reviewer for a saved exact candidate.
allowed-tools: Read, Bash(./run.sh:*)
---

# /verify

Read `AGENTS.md`, `docs/portability.md`, `loopkit.task.json` and `.loopkit/state.json`.

Run `./run.sh --resume --verify-only` (add the original `--task` path if needed). This command does not execute repairs. If no saved run exists, stop and use `/spec` then `/loop`; do not substitute an empty `git diff HEAD` review. A candidate already committed during a run is refused.

The runtime executes acceptance first, then a separate reviewer process. It requires strict JSON bound to the exact saved candidate and checks for mutation. Exit zero from a model CLI alone is not a pass. Static review is evidence alongside tests, not a substitute for them.

Report the runner exit, candidate ID and evidence path. On failure, preserve `BLOCKED.md` and candidate work. Do not claim done, commit, remove the marker or rewrite state. A slash command's prose output is not a machine verdict.
