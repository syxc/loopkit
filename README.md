# loopkit: acceptance-gated local agent loop

This fork keeps the optional skill library and replaces the open-ended shell loop with a small Node standard-library runner. One approved task, executable acceptance, disk evidence, then a separate fresh static review. No automatic commits.

## Offline quickstart

Requirements: Git, Node >=18, and a POSIX shell on Linux or macOS. This example uses no model API, credentials or quota. Run these commands from a local clone of this fork:

```sh
SOURCE=$PWD
mkdir ../loopkit-demo
cd ../loopkit-demo
node "$SOURCE/bin/loopkit.js" init
cp examples/task.demo.json loopkit.task.json
git init
git add .
git -c user.name=Demo -c user.email=demo@example.invalid commit -m "chore: approve offline demo"
./run.sh
```

Expected: `VERIFIED <candidate-id>` and an uncommitted `greeting.txt` containing `hello` and a newline. The demo reviewer is a fixed protocol fixture, not evidence of model review quality. Installer tests run this cold path with both entry points.

For real work, copy `template/loopkit.task.json` to `loopkit.task.json`. Replace its failing placeholder with the project's deterministic acceptance checks and configure two CLI adapters. Approve and commit the contract and checks before starting. Use a task small enough to verify as one slice. See [the runtime contract and adapter protocol](docs/portability.md).

## What the runner checks

1. Refuse an unsafe dirty first start. Pin the starting Git revision and exact task-file hash.
2. Invoke the executor with the task and prior failure feedback. Never request a commit.
3. Snapshot tracked and non-ignored untracked candidate files with a temporary Git index. Preserve the real index. Save the complete binary Git diff from the pinned base, including any premature commit.
4. Reject a moved HEAD or an empty candidate. Run each configured acceptance command. Check that the contract and candidate did not change.
5. Start a separate reviewer process with the contract, exact candidate ID, diff path and check results, without the executor transcript or session.
6. Require exit success AND a schema-valid JSON pass bound to this candidate. Recheck the candidate before saving `verified`.

Failed acceptance or a negative review can use the next bounded repair iteration. Invalid JSON, blocked work, timeouts, mutation, moved HEAD and exhausted limits stop with nonzero exit and `BLOCKED.md`. The runner does not treat `STATUS: done`, commit messages or feature-list booleans as authority.

## Durable evidence and resume

`.loopkit/state.json` records the base, task hash, original start time, counters, phase, candidate and rejected candidate IDs. `.loopkit/attempt-*/` holds candidate diffs, command output, exit/timeout metadata, checks and review verdicts. `events.jsonl` records phase commands and elapsed time. Review these files before resuming.

```sh
# Resolve the cause in BLOCKED.md; explicitly remove the marker yourself.
./run.sh --resume
# Re-run checks and fresh review only; never repair in this mode.
./run.sh --resume --verify-only
```

The original deadline and executor iteration count do not reset. Saved `verified` status always requires new executable checks and fresh review on resume; changed bytes cannot reuse it. A dead owner lock requires manual inspection. There is no automatic stash, reset, cleanup, commit or push. Keep `.loopkit/` and `BLOCKED.md` untracked; they are reserved runtime paths and excluded from candidate snapshots.

After verification, the user decides whether to commit. For another task, first preserve/finish the candidate, archive the old `.loopkit` evidence yourself, and approve a new contract on a clean tree. This runner does not schedule a backlog.

## Installation

The local/npm entry is `node /path/to/loopkit/bin/loopkit.js init`. The download entry calls the same installer:

```sh
# Inspect install.sh first. Pin LOOPKIT_REF to a reviewed tag or commit.
curl -fsSL https://raw.githubusercontent.com/syxc/loopkit/main/install.sh -o /tmp/loopkit-install.sh
LOOPKIT_REF=main sh /tmp/loopkit-install.sh
```

The download command applies after these changes are published to the selected ref. The local-clone quickstart works without publication. Download installation requires Node, curl and tar. It supports `DEST`, `LOOPKIT_REPO`, `LOOPKIT_REF`, `FORCE=1` and `BACKUP=1`. Existing files are kept by default; inspect kept files for old instructions before use. `--force` is an explicit overwrite, not a migration or merge. `--dry-run` is available on the Node entry. Symlink install targets are refused.

Both entries install `AGENTS.md`, `.claude/`, optional skills, `MEMORY.md`, `run.sh`, the required runtime, task template, offline examples and referenced checklists. MCP wiring remains optional in the source `.mcp.json`; it is not installed or enabled by default. A skills-only or Claude plugin install does not install the runner.

To copy one optional skill from this clone:

```sh
/path/to/loopkit/bin/loopkit-add adversarial-verify
```

## Commands and optional skills

- `/spec`: draft one task contract and supporting goal text; stop for approval.
- `/loop`: run the machine gate, or resume it explicitly.
- `/verify`: re-run executable acceptance and fresh static review on the saved candidate. A slash command's text alone cannot certify completion.
- `/polish` and `/next`: optional interactive helpers; no runner authority.

Browse [skills/](skills/) or the [routing table](skills/using-loopkit/SKILL.md). Skills are plain Markdown instructions, not enforced checks. Keep only those useful to your project. Claude-specific commands and hooks do not imply compatibility with every other agent; other CLIs need an adapter for the documented protocol.

## Periodic ablation

After a model/tool version change, and monthly during active use, follow [harness-stripping](skills/harness-stripping/SKILL.md). Pin a fixed task set and environment, compare paired baseline runs with exactly one optional component removed, run unchanged acceptance, and record quality, cost and wall time. The skill contains a reproducible protocol. Safety gates are not ablation candidates. There are no measured gains claimed by this fork.

## Checks

```sh
npm test
npm run check
```

The tests use isolated temporary Git projects and mock CLIs. No model calls occur. CI keeps skill validation, shell syntax and sync checks, and runs runtime/installer tests on Linux and macOS. Deterministic checks and static review provide different evidence; neither guarantees behavior outside their coverage.

## Trust boundary

One local owner and cooperating adapters only. This is not an OS sandbox, a hostile-agent security boundary, a budget/accounting service or a production scheduler. Adapters and checks run with the operator's permissions and inherited environment. Configure fresh sessions and read-only reviewer tools yourself. Do not put secrets in argv, task files or output. Runtime logs can contain project code and must remain local unless sharing is authorized. Git-ignored files, external dependencies, running services and tool/model internals are not part of the candidate hash. See [portability](docs/portability.md) for details and failure recovery.

## Historical material

The upstream [article](docs/effective-harnesses-v03.md), its sibling `docs/effective-harnesses-v03.pdf`, and [comparison](docs/vs-others.md) are historical, unverified source material. Their internal-eval numbers, dates, product comparisons and performance claims have not been reproduced here. They are not evidence for this runner. Optional skill guidance is advice, not a measured benefit.

MIT. Fork of Archive228/loopkit; original attribution and license retained.
