# loopkit local run contract

Decisions follow explicit acceptance. Implement one small, verifiable slice per task.

## Plan

- Read the approved `loopkit.task.json`, `PROMPT.md` if present, `.loopkit/state.json` and referenced attempt evidence, then `git log --oneline -20`.
- The task file defines the goal, executable acceptance, CLI adapters and finite limits. Commit the approved contract and project checks before starting the runner. Do not edit them to fit an implementation.
- Prose plans, feature-list booleans and Git commit messages are context, not proof of completion.
- Use optional `skills/*/SKILL.md` (source) or `.claude/skills/*/SKILL.md` (installed) when they help this task. No mandatory all-skill bootstrap.

## Act

- Keep the task small. Preserve existing work. The runner refuses a dirty first start.
- Do not commit, reset, stash, clean, push, move HEAD, edit the contract or write `.loopkit` runtime files during a run. The runner owns its state and evidence.
- Do not weaken checks or delete tests to obtain a pass. Stop for a contract correction if the check is wrong.
- If a decision or permission is missing, write `BLOCKED.md` with the cause and required human action. Stop. External notifications are optional and require authorization.
- Do not install tools, use paid APIs or access private services without task authorization. The runner does not grant these permissions.

## Verify

- `./run.sh` runs the configured executor, deterministic project checks and a separate fresh reviewer process.
- The reviewer provides static evidence against the exact candidate; it is not a replacement for executable acceptance or required project CI.
- CLI exit success, a model's done text, `/verify` prose and stale saved status cannot mark a task verified. The runner validates the JSON verdict and candidate binding.
- `./run.sh --resume --verify-only` checks an existing run's candidate without executing a repair. Changed candidates or contracts invalidate saved evidence. Review before an authorized human commit.
- Never claim completion after a failed check or review. Preserve evidence and report the failure.

## Resume and delivery

- Inspect `BLOCKED.md` and `.loopkit/state.json`. Resolve the cause, explicitly remove the marker, then use `./run.sh --resume`. Counters and the original wall-clock deadline persist.
- A dead process can leave `.loopkit/owner.lock`. Confirm the owner is dead before removing that lock manually. Do not start two owners in one worktree.
- The runner leaves successful changes uncommitted. Commit/push only on explicit user instruction, after required checks and review. Stop any task-started services.
- Do not delete candidate work to obtain a clean tree. The human decides how to preserve it and when to archive old run evidence.

## Boundary and maintenance

This is a local workflow gate for cooperating tools and one owner, not a security sandbox or production scheduler. Adapters, checks, Git configuration, local files and the operator are trusted. Review independence means a new process without an executor session; model quality and read-only behavior are not enforced by OS isolation. See `docs/portability.md`.

After a model/tool change, and at least once per month of active use, apply `skills/harness-stripping/SKILL.md` (or its installed path). Use fixed task revisions and paired baseline/one-component-removed runs. Keep acceptance, failure gates and authorization boundaries intact. No performance gains are claimed without saved measurements.
