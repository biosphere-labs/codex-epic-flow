---
name: epic-flow-status
description: >
  Report where every Epic Flow feature is: its stage, state, last event,
  open questions and the next command to run. Read-only. Use when the user
  asks for the status of an epic or feature, which stage comes next, where
  a feature's records are, what Epic Flow is waiting on, or runs
  $epic-flow-status. Does not run a stage.
---

# Epic Flow: Status

Read `conventions.md` in the plugin root (two levels up from this skill's base directory) before anything else.

Report where each feature is and what runs next. This skill reads files only. It never edits, moves or commits anything.

## The stages, in order

| # | Stage | Instructions | Writes |
| --- | --- | --- | --- |
| 1 | Idea | `$epic-flow-idea` | `brief.md`, `idea` |
| 2 | Brainstorm | `stages/brainstorm.md` | `brief.md`, `accepted` |
| 3 | Technical plan | `stages/technical-plan.md` | `technical-plan.md`, `ready` |
| 4 | Decompose | `stages/decompose.md` | `tasks/NNN.md`, the contract commit or `contract: none` |
| 5 | Gaps | `stages/gaps.md` | `gaps.md` |
| 6 | Build | `stages/build.md` | the code, task status |
| 7 | Verify | `stages/verify.md` | `verify.md`, closes the plan |

`$epic-flow-run` runs a range of stages over one feature or many, including one stage on its own.

## How to work

1. Find `<repo>` with `git rev-parse --show-toplevel` in the main checkout. Records are in `<repo>/.epic-flow/<slug>/`.
2. For each feature, read `status.md` first. Take the stage and state from its front matter and the time from its last event line.
3. When `status.md` is missing, infer the stage from the records, and mark the row **inferred**:
   - `brief.md` is `idea` or `draft`: brainstorm is next.
   - `brief.md` is `accepted` and no plan exists: technical plan is next.
   - `brief.md` has `plan:`: report it under that plan's slug.
   - The plan is `ready` and there are no tasks: decompose is next.
   - There are tasks and no `gaps.md`, or the verdict is `blocked`: gaps is next.
   - The verdict is `clear` and some task is not `closed`: build is next.
   - Every task is `closed` and `verify.md` is missing or not `passed`: verify is next.
   - The plan is `closed`: the feature is done.
4. Count the `open` headings in `questions.md`. Build cannot start while any are open.
5. Pick the next command:
   - Open questions block the next stage: `$epic-flow-run <slug>`, which asks them first.
   - The state is `waiting` or `stopped`: `$epic-flow-run <slug>`, which resumes from `status.md`.
   - Otherwise: `$epic-flow-run <slug>` to carry on, or `$epic-flow-run <slug> only <next stage>` for just that stage.

## Report

All features: one table, one row each.

| Feature | Stage | State | Last event | Open questions | Next |
| --- | --- | --- | --- | --- | --- |

- **Stage** is the stage the feature is in, or the last one it finished.
- **State** is `running`, `waiting`, `stopped` or `done`, followed by **inferred** when that applies.
- **Last event** is the time from `status.md`, or blank when inferred.

Give the records folder as a full path under the table.

One feature (the user named a slug):

- Its table row.
- Every event line in `status.md`, oldest first.
- Every `open` question in full, with what it blocks and its default.
- Task counts by status: `open`, `blocked`, `closed`. List each `blocked` task with the reason in its body.
- The gaps verdict and round, and the verify result, when those records exist.
- The full paths of the feature's records folder, and of its worktree `<repo>/.worktrees/<slug>/` when it exists.

For "which stage comes next" or "where are the records", answer from the same reading: the next command, and the full path.

## Done when

- Every folder under `.epic-flow/` has one row, except briefs folded into a plan through `plan:`.
- Each row's stage and state match `status.md`, or are marked **inferred** and follow the rules above.
- Each open-question count matches the `open` headings in that feature's `questions.md`.
- Each row names one next command.
- `git status` in `<repo>` shows no change made by this skill.
