---
name: adversarial-verify
description: Review a diff against the goal spec assuming the code is BROKEN. The reviewer
  that lives in the maker's head always agrees with itself — this pulls review into a
  hostile, separate pass. Invoke after every code change before marking work done.
when_to_use: a code change is "done", before flipping a task to complete, before commit
---

# Adversarial Verify

Default stance: **the code is broken until proven otherwise.** Your job is to find where.
Do not be polite. Do not propose fixes. Do not run the code. Just hunt.

## Read first

- The approved `loopkit.task.json` and supporting scope text. What does acceptance require?
- The supplied candidate ID and full pinned-base-to-candidate diff, not only `git diff HEAD`. Read connected source and every changed line.
- Executable check evidence. Static review supplements these checks; it cannot replace them.

## The 11 shortcuts agents take to fake "done" — check each

1. **Relaxed tests** — assertions weakened or deleted to make red go green.
2. **Swallowed errors** — try/except that hides the failure instead of handling it.
3. **Fake renames** — a function "fixed" by renaming, behavior unchanged.
4. **Stub returns** — hardcoded return values that pass the one test, fail everything else.
5. **Comment-as-fix** — the bug is now a TODO.
6. **Happy-path only** — 500s, empty inputs, missing files unhandled.
7. **Scope creep** — changes unrelated to the goal ("while I was in there").
8. **Invented API** — a method/param that doesn't exist in the actual source.
9. **Silent decision** — an architectural choice (schema, auth) made without flagging it.
10. **Pass-by-mock** — the test mocks the exact thing it claims to verify.
11. **Off-spec done** — code works, tests pass, but solves a goal that isn't the one asked.

## Output (JSON, no prose)

```json
{"task_id":"copy-task-id","candidate_id":"copy-candidate-id","passes":false,"failures":["file:42: swallowed error hides acceptance failure"]}
```

Use exactly these fields and boolean types. A pass requires `failures:[]`; a rejection requires at least one nonempty failure. Missing candidate identity is not a pass. Return only the object. The local runner validates it and rechecks the candidate; CLI exit success alone has no completion authority. Run the reviewer in a fresh process/context without executor history.
