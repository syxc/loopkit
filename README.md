# loopkit

A local agent loop with five responsibilities:

- Approve executable acceptance before implementation.
- Implement one small, verifiable slice.
- Persist progress and evidence for safe resume.
- Require separate static review bound to the exact candidate, alongside tests.
- Periodically compare the baseline with one optional component removed.

No skill library, plugin system, service integrations or automatic commits. The runtime uses only Node's standard library and Git.

## Install and try offline

Requirements: Git, Node >=18 and a POSIX shell on Linux or macOS. From this source checkout:

```sh
SOURCE=$PWD
mkdir ../loopkit-demo
cd ../loopkit-demo
node "$SOURCE/scripts/install.js"
cp examples/task.demo.json loopkit.task.json
git init
git add .
git -c user.name=Demo -c user.email=demo@example.invalid commit -m "chore: approve offline demo"
./run.sh
```

Expected: `VERIFIED <candidate-id>` and uncommitted `greeting.txt` containing `hello` and a newline. No model or network calls occur. The demo reviewer is a protocol fixture, not a code-quality reviewer.

Use this same installer from your real project's directory. `--dry-run` previews writes. Existing files are never overwritten; inspect any kept files before use. Symlink targets are refused. There is no download installer or package-bin entry point.

## Use a real task

Copy `template/loopkit.task.json` to `loopkit.task.json`. Set one concrete goal, deterministic acceptance commands, executor/reviewer argv and finite limits. Include required project checks and the runtime path when needed. Configure fresh reviewer sessions and authorize any paid calls separately. Approve and commit the task and checks on a clean tree before `./run.sh`.

Read [the runtime contract](docs/loopkit.md) for the adapter JSON protocol, exact candidate identity, evidence and failure handling. That guide is installed with the runtime. `AGENTS.md` states the agent's responsibilities; neither prose nor CLI exit success can bypass the machine gate.

On failure, inspect `BLOCKED.md` and `.loopkit/state.json`, resolve the cause, explicitly remove the marker, then use `./run.sh --resume`. Add `--verify-only` to avoid repairs. Rejected candidate IDs, iteration counts and the original wall-clock deadline persist. Never reset, discard or commit candidate work automatically.

After a model/tool change, and monthly during active use, follow the [paired ablation protocol](docs/loopkit.md#periodic-ablation). It uses fixed task revisions, unchanged checks, pinned versions, and recorded cost/time; it claims no measured gains.

## Verify this project

```sh
npm test
npm run check
git diff --check
```

Tests use isolated Git fixtures and mock CLIs, including cold installation and the offline success path. No model quota is used. CI is configured to run tests and syntax checks on Linux/macOS with Node 18/22.

This is a workflow gate for one local owner and cooperating adapters, not a security sandbox or scheduler. Tools run with the operator's permissions and environment. Ignored files, external services and model internals are outside candidate identity. Keep secrets out of task files, argv and logs. Actual model quality and reviewer tool restrictions remain operator responsibilities.

MIT. Fork of Archive228/loopkit; the original copyright and license are retained in `LICENSE`.
