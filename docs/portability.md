# Local runner contract

## Runtime and scope

Use Node >=18, Git and a POSIX shell on Linux or macOS. Run `./run.sh` from the Git worktree root. No package installation is required. The shell entry works with `sh`, Bash 3.2 and newer shells; no shell arrays or GNU `timeout` are used. CLI commands are argv arrays, never shell-split strings or `eval`.

The runner has one local owner. `.loopkit/owner.lock` uses exclusive file creation. It does not coordinate multiple worktrees, machines or untrusted processes. Adapters, checks, Git configuration/hooks and operator-owned state are trusted. No application/model process is sandboxed. Do not run untrusted task files.

## Task file

Copy `template/loopkit.task.json` to `loopkit.task.json` and replace every placeholder. Approve and commit it before the first run. Use `./run.sh --task path/to/task.json` for another path inside the worktree. A task has exactly these fields:

| Field | Contract |
|---|---|
| `version` | Integer `1` |
| `task_id` | Nonempty ASCII letters, digits, `_` or `-` |
| `goal` | Nonempty user-observable outcome, one slice |
| `acceptance` | Nonempty array of `{id, description, argv}`; unique nonempty IDs |
| `executor` | Nonempty argv array for the executor adapter |
| `reviewer` | Nonempty argv array for a fresh reviewer adapter |
| `limits` | `{max_iterations, command_timeout_seconds, run_timeout_seconds}`, positive integers <=86400 |

Each acceptance command must assert an observable condition and exit nonzero on failure. Include existing mandatory project checks and a runtime/E2E check when the change needs it. The template intentionally fails until configured. The runner cannot determine whether a check is sufficient or whether tests were weakened; the static reviewer and user must examine this.

The exact task bytes are hashed; even whitespace changes invalidate a saved run. Bounds are cumulative across resumes: `max_iterations` counts executor invocations; `run_timeout_seconds` is wall time from the original run start, including downtime; every child command also has `command_timeout_seconds`. Verification-only calls consume time, but not executor iterations.

## Adapter protocol

The runner appends one JSON prompt as the adapter's final argv argument, uses the project root as cwd and closes stdin. The adapter must write exactly one JSON object to stdout; diagnostics belong on stderr. No prose, code fences, duplicate keys, CLI transport envelopes, missing/extra fields or string booleans are accepted. Stdout over 1 MiB is rejected for model results. Nonzero CLI exit is failure even if stdout says pass. Exit zero is not a verdict.

Executor prompt includes `task`, `iteration`, pinned `base`, prior failure `feedback` and instructions. Return:

```json
{"task_id":"my-task","status":"candidate","summary":"Implemented the approved slice"}
```

`status` can be `candidate` or `blocked`. A blocked response or `BLOCKED.md` stops the run. Do not commit or move HEAD, edit the task, or write `.loopkit` files. There is no `done` status.

Reviewer prompt includes `task`, `candidate`, `diff_path`, executable `checks` and static-review instructions. It does not include the executor transcript. Return:

```json
{"task_id":"my-task","candidate_id":"copy-the-exact-candidate-id","passes":true,"failures":[]}
```

`passes` must be boolean. A negative verdict needs at least one nonempty failure string. A positive verdict needs an empty failures array. The task/candidate IDs must match exactly. Read the supplied full diff and connected code; do not edit files or execute application code. Acceptance has already run as a separate step.

Use a fresh process without a session/resume flag or shared conversation history. New process creation is enforced; independence of an adapter's remote session and tool restrictions are operator responsibilities. Prefer a separate reviewer tool profile. The same model may be used in a fresh context, but a second model does not guarantee review quality. CLI default models can drift, so pin model/tool versions in adapter argv or configuration.

For a CLI that accepts a final prompt and emits only final text, an argv can have the form `["cli", "print-mode-flag", "model-flag", "pinned-model-id"]`. This is a protocol illustration, not a claim about a particular CLI version. Use a small local adapter to unwrap a CLI's documented transport envelope or read a result file. Validate the transport exit and result; do not extract an arbitrary JSON-looking substring. Do not reuse a CLI session for review. Legacy `LOOPKIT_CLI` and `CLAUDE_*_MODEL` environment variables are not read; put the exact executable, flags and model in the approved task.

The offline `examples/demo-cli.js` shows both sides of this protocol without calling a model. It is a fixed test fixture, not a code-quality reviewer.

## Candidate and evidence

The runner pins the clean starting HEAD. It uses a private temporary Git index to add tracked and non-ignored untracked files, writes a Git tree, and saves a binary diff from the pinned base to that tree. It does not stage the real index. A premature executor commit is rejected, but its full base-to-candidate diff is saved before rejection. It cannot disappear behind `git diff HEAD`.

The candidate ID is SHA-256 over the base, current HEAD, candidate tree, binary diff digest and task-file digest. Checks and review must leave it unchanged. The verdict is bound to that exact ID. Empty diffs cannot pass. `.loopkit/` and `BLOCKED.md` are reserved untracked runtime paths and excluded; tracking them is refused. The runtime creates `.loopkit/.gitignore` to keep its own evidence out of ordinary staging. Keep `BLOCKED.md` out of commits as well. Git-ignored files and external state are outside this binding. Submodules and nested Git repositories are refused because a Git link cannot bind dirty nested contents. Configure checks not to rewrite tracked files or create non-ignored build output. Do not change files concurrently with a run.

State is replaced atomically on disk. Its `rejected_candidates` ledger retains exact IDs rejected by acceptance or static review, independently of the current phase or blocker text. State without this required ledger is refused, not silently migrated with forgotten decisions. Attempt directories retain stdout/stderr, command argv, elapsed time, exit/signal/timeout metadata, candidate diff/identity, check results and parsed verdict. `events.jsonl` records commands and results. Evidence is local and operator-editable, not signed or tamper-proof. Logs are not bounded by a disk quota; use trusted CLIs and monitor available disk space. They can contain source code; do not share without authorization.

## Failure, resume and exit codes

- `0`: checks and a valid fresh static review passed for the unchanged candidate, or `--help` printed.
- `1`: invalid command-line syntax.
- `2`: blocked/configuration/runtime/verification failure. Read stderr, `BLOCKED.md` and attempt evidence. No completion claim is made.

`BLOCKED.md` is never overwritten. A pending `SPEC-PENDING.md` without `SPEC-APPROVED.md` also stops the runner. These files express a local human gate, not an authenticated approval system.

Resolve the cause, explicitly remove `BLOCKED.md`, then run `./run.sh --resume` with the same task path. Counters and deadline remain. Partial execution resumes with another executor iteration; a saved checking/reviewing phase re-runs checks and fresh review of the same candidate. A saved verified phase also re-runs checks/review; it never trusts saved done text. Changed candidate bytes in verification invalidate the old evidence. `--resume --verify-only` performs no repair and requires an existing run.

Failed acceptance or a schema-valid negative review can trigger the next bounded executor iteration. That repair must change the rejected candidate; an unchanged candidate cannot obtain a pass by asking again. The rejection ledger survives blocking, explicit unblock and every resume mode, including `--verify-only`. A changed candidate can be reviewed without erasing earlier rejections. Malformed verdicts, command failures, markers, mutation, moved HEAD and timeouts stop rather than guessing. On timeout or signal, the runner terminates the command's POSIX process group and records failure. Detached/remote processes that escape that group are outside its control; adapters must not start persistent services. A killed runner can leave the lock behind. Verify its PID is dead, inspect state and evidence, then remove only the stale lock manually.

Caps cannot be raised by editing an active contract. When exhausted, preserve the candidate and evidence, decide manually whether to finish or abandon the task, and start a new approved clean run only after archiving old state. No automatic reset, stash, cleanup, commit or push is performed.

## Installation

From a reviewed clone, run `node /path/to/loopkit/bin/loopkit.js init` in the target. `--dry-run` lists actions, `--force` explicitly overwrites. Existing files otherwise remain; inspect retained files for old commands or conflicting rules. The download `install.sh` requires Node/curl/tar and delegates to this same copy list. `LOOPKIT_REF` accepts a Git ref, including a commit; pin one reviewed by your team. `DEST` must already exist. `BACKUP=1` snapshots `.claude` only; it does not back up every overwritten file.

Both entries include `AGENTS.md`, required runtime, contract template, offline examples and checklist references. The source `.mcp.json` is optional and not installed. A Claude plugin or a skills-only install supplies instructions, not the runner or a verification gate. The runnable offline quickstart is in the root README; it creates a separate demo project and makes only a fixture commit.
