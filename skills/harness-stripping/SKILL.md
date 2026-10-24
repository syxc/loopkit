---
name: harness-stripping
description: Run reproducible paired ablations after a model/tool change or monthly during active use, removing one optional component while keeping executable acceptance and safety gates fixed.
---

# Periodic ablation

Use this protocol after a model/tool version change, and at least monthly while actively using the loop. It is a manual experiment protocol, not a benchmark service. Do not claim gains before collecting evidence. Paid runs need explicit authorization.

## Freeze the experiment before running

Create an experiment directory outside the active project, on a local path approved by the user. Save a manifest with:

- Experiment date, hypothesis and exactly one removed optional component, such as a prompt paragraph or optional skill.
- Runner Git SHA, component baseline SHA and variant patch. No unrelated variant changes.
- Fixed task IDs, repository SHAs, task-file hashes and acceptance commands. Include a happy path, an error path and a previously failed task when available. Use the same tasks for every pair; do not select only successes after seeing results.
- Exact CLI versions, model IDs/provider versions available to you, adapter argv, tool versions, OS, dependencies/lockfiles and permission profiles. Record any provider version that cannot be pinned.
- Repetition count, ordering and decision rule. A small first protocol can use three fixed tasks and two paired repetitions each. Alternate baseline-first and variant-first. This is a procedure example, not a sample size that proves statistical significance.
- The same iteration, time and spending budgets for each arm, plus the source of actual usage/cost data. If spending cannot be bounded by the provider/adapter, use a human-approved run budget and stop manually at the limit. The local runner has no monetary quota gate.

Do not remove executable acceptance, JSON validation, candidate binding, blocked-state gates, caps, permission checks or other safety controls. Use a non-production copy with no private services. The variant removes only the selected optional component.

## Execute paired runs

1. For each fixed task/repetition, prepare two new local worktrees at the manifest's task revision. Use the same approved task, adapters and checks; only the variant gets the component-removal patch. Have the operator approve and commit each arm's setup before the run, then record the resulting starting SHAs and identical task hashes. Both trees must be clean. This prerequisite does not grant an agent automatic commit permission. Do not reuse prior state or conversation.
2. Record the exact command for each arm: `./run.sh --task <fixed-task-path>`. Start a wall-clock timer immediately before launch. Use the manifest's alternating order. Do not run both arms against a shared mutable service.
3. Keep the runner exit code and all `.loopkit` evidence, including failed attempts and `BLOCKED.md`. Run the manifest's unchanged external acceptance command against each final candidate as well, with the same timeout. Record the full result even if the agent claims success.
4. Record model/provider usage and actual cost from the same accounting source for both arms. Missing cost is `unknown`, not zero. Record wall time, executor iterations, check outcomes, review verdicts and any human intervention. A timeout or blocked run is an outcome, not a row to discard.
5. Repeat the exact pair according to the frozen manifest. No prompt/check/model tuning mid-experiment. A necessary correction invalidates affected pairs; restart both arms and retain the discarded evidence with a reason.

Use a plain CSV or JSON table, one row per task/repetition/arm:

```text
experiment,task,task_revision,repetition,arm,component,runner_sha,model,cli_version,exit,acceptance,review,iterations,wall_seconds,input_tokens,output_tokens,cost,cost_source,human_intervention,evidence_path
```

## Compare and decide

Compare within each task/repetition first: acceptance pass/fail, known regressions, cost and elapsed-time deltas. Report all pairs and the number of failures, not only an aggregate score. Use actual numerical measurements only; avoid causal or statistical claims that the sample cannot support.

Apply the predeclared rule. For example: retain the simpler variant only if it introduces no acceptance regression in the fixed set and does not exceed the cost/time budget; otherwise keep the baseline and state the observed failure. Small samples can be inconclusive. Do not generalize beyond the tasks and pinned versions.

Save the manifest, variant patch, result table and decision together. Change a project component only with normal review and authorization; do not auto-commit. Start the next ablation from the newly approved baseline, removing one component again. Keep protocols lightweight enough to repeat.
