---
description: Draft one machine-readable task and executable acceptance, then stop for approval.
allowed-tools: Read, Write
---

# /spec

1. Read `AGENTS.md`, `template/loopkit.task.json` and `docs/portability.md`.
2. If `loopkit.task.json` exists, stop. Do not overwrite an approved or active contract.
3. Draft one small task in `loopkit.task.json`: concrete goal, deterministic acceptance argv, executor/reviewer adapter argv and finite limits. Use real project commands. Include existing required checks and the runtime path when needed. Do not invent a passing placeholder.
4. Add `PROMPT.md` only if scope boundaries need more explanation. It supplements, not replaces, the JSON contract.
5. Stop for human approval. The user must review the contract, adapter permissions and checks and commit them on a clean tree before running `./run.sh`. Do not implement, commit or invoke a model in this step.

If acceptance or adapters cannot be specified, state what is missing. Do not declare the task ready. Plans and `STATUS: done` text have no completion authority.
