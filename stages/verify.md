# Epic Flow: Verify

Read `conventions.md` in the plugin root (one level up from this file) before anything else.

Check the feature against its acceptance criteria. A `closed` task counts only after its check runs again here. A criterion holds only when a test goes through the real entry point, passes, and fails under both probes.

## How to work

1. Read `technical-plan.md`, every task, `questions.md` and `status.md`. If any task is not `closed`, stop: build has not finished. Write `verify started` to `status.md`.
2. Work on the feature branch in `<repo>/.worktrees/<slug>/`. Confirm with `git -C <worktree> log -1` that it holds build's last commit (its merge train, when the build was parallel). When branch `<branch>-acceptance` exists, merge it: it holds acceptance tests written during the build. It may contain test files only; anything else is a failed criterion for the task set, not something to merge.
3. Re-run every task's check. Then run this project's own tests for the areas the tasks changed. Find the test command in the repository (package scripts, build files, CI config). Record each command, its exit code and the counts.
4. For each criterion, find the test that proves it through the entry point the criterion names (the route, the subscription, the command, the scheduled job), and check that it runs every one of the criterion's examples. If there is none, or an example is missing, write it. Verify may add tests. It never changes product code.
5. Run two falsification probes for each criterion, and revert each one before the next:
   - **Disable the implementation.** Make the code the criterion is about return nothing or throw. The test must fail.
   - **Cut the entry point.** Remove the subscription, the route registration, the bean, or the job schedule. The test must fail.
   If a test still passes under a probe, it does not prove the criterion. One real test passed 6/6 with the topic subscription removed, because the probes broke the logic and never the wiring. Confirm with `git -C <worktree> status` that every probe is reverted.
6. Judge each criterion:
   - **held**: the test goes through the entry point, passes, and fails under both probes.
   - **failed**: the test fails, or the code does something the criterion or a recorded decision rules out.
   - **not tested**: no test reaches the entry point, a probe left the test green, or the test substitutes a fake for the behaviour the criterion is about.
   Cite the command and what it showed.
7. A wrong decision found here is a failed criterion. Example: the plan chose JSON where the platform's publisher is Avro only. Name the decision and the code that contradicts it.
8. When a criterion needs something only the user can do, such as a supervised run with real credentials, write it to `questions.md` as `open`. Do not write a checklist for them to tick.
9. Commit the tests this stage added on the feature branch.

## Write the record

Write `.epic-flow/<slug>/verify.md`:

```yaml
---
name: <slug>
result: passed | failed | waiting
---
```

- **Criteria.** One entry per criterion:
  - `AC-n`: held, failed or not tested.
  - **Test**: the test, and the entry point it goes through.
  - **Evidence**: the command, the exit code, what it showed.
  - **Probe, implementation disabled**: what you changed, and the result.
  - **Probe, entry point cut**: what you removed, and the result.
  - **Tasks**: the ids whose `criteria:` list it.
- **Task checks.** Each task id, the command, the result.
- **Full suite.** The command, the exit code, passed, failed and skipped counts. Name each failure and whether it also fails on the base branch.
- **Tests added.** Paths of tests this stage wrote, the criterion each one proves, and the commit.

## Then

- **Every criterion held:** result `passed`. Set the plan's status to `closed`. Write `verify finished: passed` to `status.md` and set its state to `done`.
- **Any criterion failed or not tested:** result `failed`. Reopen the tasks responsible: set each to `open`, and add one line under **Reopened** with the criterion, the evidence, and `verify`. When no task owns the gap, add a task numbered after the last one, with the conventions' front matter and the criterion in `criteria:`. Leave the plan `in-progress`. Write `verify finished: failed` with the criterion ids to `status.md`. Alone, name the build stage as the next stage. Do not end by asking a question.
- **A criterion waits on the user and nothing failed:** result `waiting`. Write `verify waiting` with the question ids to `status.md` and set its state to `waiting`. Leave the plan `in-progress`.

## Done when

- `verify.md` exists with `result` set to `passed`, `failed` or `waiting`.
- It has one entry per criterion in `technical-plan.md`, each with a result, a test, evidence, and both probe results.
- It records every task's check, and a full-suite command with its exit code.
- `git -C <repo>/.worktrees/<slug> status` shows no leftover probe edits, and every test listed under **Tests added** is in a commit on the feature branch.
- `passed` only when every criterion is held, and then the plan's status is `closed`.
- `failed` only when at least one criterion failed or was not tested, and then each responsible task is `open` with a **Reopened** line, or a new task lists that criterion.
- `waiting` only when an `open` question in `questions.md` names the criterion it blocks.
- `status.md` has a `verify` line for this run that matches the result.
