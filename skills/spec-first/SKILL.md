---
name: spec-first
description: Write the goal spec on disk before the agent acts, so it can't drift. Use before any multi-step task.
when_to_use: a task with more than 2 steps, a long-running job, "build X", agent drifting
---
# Spec First
Write the approved `loopkit.task.json` BEFORE starting the local runner, using `template/loopkit.task.json`. It must include executable acceptance, explicit adapters and finite limits. Supporting `PROMPT.md` can state:
- **Goal** — one sentence.
- **Done when** — concrete, checkable conditions. "Test suite green: <cmd>".
- **Never touch** — files/areas off-limits.
- **Stop if** — more than N files outside scope change; a passing test starts failing.
The user reviews and commits the contract and checks before running. Do not edit an active contract to fit the candidate. `.loopkit/state.json` and exact-candidate evidence belong to the runner; a prose plan is context only. If you cannot write executable acceptance, the task is not ready. Clarify before coding.
