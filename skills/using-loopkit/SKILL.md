---
name: using-loopkit
description: Find optional loopkit skills and the local acceptance-gated runner when starting work in a loopkit project.
---

# Using loopkit

Read `AGENTS.md` and the approved task first. Use skills only when they help the current goal. No fixed invocation count or mandatory announcement is required. Skills are advice, not runtime completion authority.

## Paths

- Source clone: `skills/<name>/SKILL.md`.
- Installed project: `.claude/skills/<name>/SKILL.md`.
- Runner: `./run.sh`, with `loopkit.task.json` as its default contract.
- Protocol and trust boundary: `docs/portability.md`.
- Durable progress: `.loopkit/state.json` and the attempt evidence it names.

## Focused routing

| Need | Useful skills |
|---|---|
| Define acceptance | `spec-first`, `sprint-contract` |
| Fix a failure | `systematic-debugging`, `read-the-trace`, `write-failing-test-first` |
| Test an interface | `contract-test`, `coverage-gaps` |
| Review the candidate | `adversarial-verify`, `verification-before-completion`, `self-eval-bias` |
| Reduce code | `simplify`, `reduce-nesting`, `kill-dead-code` |
| Security or data | `authz-check`, `input-validation`, `owasp-review`, `sql-review` |
| UI behavior | `a11y-pass`, `loading-empty-error-states`, `design-system` |
| Resume | `progress-reading-protocol`, `shift-notes` |
| Missing decision | `hitl-escalate` |
| Model/tool change or monthly maintenance | `harness-stripping` |

Browse the remaining skill directories for domain-specific work. Legacy feature ledgers and progress notes can provide context, but their booleans or prose cannot bypass the runner's tests and exact-candidate review. Never auto-commit because a skill says to ship. User instructions and project authorization take priority.

## Small skill contributions

Use `template/SKILL.md`, keep a concrete trigger and short procedure, then run `scripts/validate-skills`. Before/after evidence is useful when real; do not invent transcripts, measured gains or mandatory marketing artifacts. New skills do not need a new runtime framework.
