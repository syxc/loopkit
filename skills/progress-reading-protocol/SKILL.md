---
name: progress-reading-protocol
description: Reconstruct a local task from its approved contract, persisted state, exact candidate evidence and Git history before resuming; never trust stale done text.
---

# Read progress before resuming

1. Confirm `pwd` is the intended Git worktree root. Read `AGENTS.md` and the original task path.
2. Read `.loopkit/state.json`, `BLOCKED.md` if present, and the referenced attempt evidence. Compare task hash, base revision, candidate identity, check results and review verdict. Treat state as operator-owned local data, not a signed authority.
3. Read `git status` and `git log --oneline -20`. Do not discard dirty work, move HEAD or auto-revert a commit to fit the state.
4. Use prose handoffs, `IMPLEMENTATION_PLAN.md`, feature ledgers and decision notes as context only. A `done` line or `passes:true` is not executable acceptance.
5. Resolve the documented blocker. Only the authorized operator may explicitly remove `BLOCKED.md` or a confirmed dead owner's lock. Do not reset the original counters or deadline.
6. Run `./run.sh --resume` with the same `--task` path, or add `--verify-only` to avoid repairs. A saved verified/checking/reviewing candidate must pass checks and fresh static review again. Changed bytes cannot reuse prior verification.

If a live runtime path is required by the goal, include it in deterministic acceptance. Do not assume a running server proves the feature works. Stop task-started services before delivery. There is no automatic cleanup, commit or push.
