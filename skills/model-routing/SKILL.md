---
name: model-routing
description: Configure pinned executor and fresh reviewer CLI adapters in a local task contract; measure model tradeoffs rather than assuming a winning tier.
---

# Model routing

Set `executor` and `reviewer` argv arrays in the approved `loopkit.task.json`. The runner appends one JSON prompt to each. It does not read legacy `LOOPKIT_CLI` or `CLAUDE_*_MODEL` variables, split shell strings, or launch a planner model implicitly. See `docs/portability.md` for the adapter protocol.

Pin the CLI version and model ID in adapter configuration. Start the reviewer without a session/resume identifier or executor conversation. Review must remain separate even if both roles use the same model. Configure a read-only reviewer tool profile; the runner is not a sandbox.

Choose models based on saved task acceptance, quality, wall time and actual cost. A cheaper executor and stronger reviewer is an option to test, not a verified performance claim. Use `harness-stripping` for paired comparisons after model/tool changes. Do not run paid experiments without authorization.
