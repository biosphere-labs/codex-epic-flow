# How Epic Flow works

[← Back to the README](../README.md)

## The stages

| # | Stage | Run with | What it produces |
| --- | --- | --- | --- |
| 1 | Idea | `$epic-flow-idea` | Parks an idea in seconds, in your own words, and asks nothing |
| 2 | Brainstorm | `$epic-flow-run` | An accepted brief: problem, decisions, approach, success, delivery |
| 3 | Technical plan | `$epic-flow-run` | A plan grounded in your codebase, with numbered acceptance criteria |
| 4 | Decompose | `$epic-flow-run` | Self-contained tasks, level by level: modules, then interfaces, then units |
| 5 | Gaps | `$epic-flow-run` | Missing tasks found and added, then reviewed by two blind reviewers |
| 6 | Build | `$epic-flow-run` | The code, built sequentially or in parallel |
| 7 | Verify | `$epic-flow-run` | Every acceptance criterion proven, or the responsible tasks reopened |

`$epic-flow-run` takes features through any range of stages ("through decompose", "from gaps"), or runs a single stage with you there ("only gaps"). The rules every stage follows are in [`conventions.md`](../conventions.md).

## The run

`$epic-flow-run` works in three steps:

1. **Develop.** For each feature, one agent drafts the brief and asks Socratic questions. A second agent, with a fresh context, answers what it can from the code and the records. Two rounds at most.
2. **Question session.** You get every question neither agent could settle, across all features, in one sitting. You also choose delivery (branches, push, PR, time budget) and the build shape.
3. **Unattended.** Technical plan, decompose, gaps, build and verify run without you. Independent features run at the same time. A feature that needs another's result waits for it.

## Criteria, examples, tests

Every acceptance criterion in the technical plan carries examples: concrete cases with real values, written as given, when, then. At least one shows the usual case and at least one an edge or failure case. For example:

```
AC-3  A user can rename a project; the new name shows everywhere it is listed.
  AC-3.1  given project "Alpha", when renamed to "Beta", then GET /projects lists "Beta" and not "Alpha"
  AC-3.2  given project "Alpha", when renamed to "", then the API returns 400 "name is required" and the name stays "Alpha"
```

Examples are where ambiguity shows up: a value nobody can fill in becomes a question before any code is written. They flow down unchanged. Each task copies the examples it makes true, and its unit tests are those examples. The acceptance test for a criterion runs its examples through the real entry point. Gaps checks every example has a test, and verify runs them all.

## Questions are answered in a fixed order

Before a question reaches you, the stage tries each of these in order and takes the first that answers it:

1. what you already said
2. the repository
3. a reference product the brief names
4. the platform's default
5. the smaller, reversible option

Each answer goes into `questions.md` with the rule that gave it, so you can overturn any assumption later. Only questions that are genuinely yours reach you: purpose, scope, credentials, and anything only a person can do.

## Sequential or parallel

Before the run starts, Epic Flow analyses each feature: the parts it splits into, which parts need another's result, and the longest chain of dependent tasks. It then offers both shapes, each with three things:

- **A time estimate, as a range.** It comes from how long tasks have taken on your machine, a real timing of your test suite, and the machine's cores and load. Until enough tasks have been timed, it labels the figure as assumed, not measured.
- **A risk level**: low, medium or high.
- **The reasons for that risk.** For example: the model running the build isn't the most capable tier and the work is complex, or two parts may depend on each other in a way it can't confirm.

```mermaid
flowchart TB
    A[Shape analysis] --> Q{You choose}
    Q -- Sequential --> S1[Interfaces written into the tasks]
    S1 --> S2[One worktree, tasks in dependency order]
    S2 --> S3[Check and commit after every task]
    Q -- Parallel --> P1[Contract commit: interface stubs and contract tests]
    P1 --> P2[Independent groups build at once, each in its own worktree]
    P2 --> P3[Merge train onto the feature branch]
```

**Sequential** has one writer at a time. Decompose writes each interface into the task that produces it, and every task that uses it quotes it word for word and runs after it. The order protects the seams, so there's nothing to freeze and nothing to merge. Decompose is faster and the build is simpler.

**Parallel** has several writers at once. Decompose writes every interface between them as compiling code (interface stubs with contract tests) and freezes it in a contract commit before any implementation starts. Writers fill in bodies behind those frozen seams, so two agents can't guess differently about the same interface. Finished groups go through a merge train, and each group is tested on top of the ones ahead of it.

You choose once, up front. If you chose parallel and the real task graph turns out to be one long chain, the build runs sequentially and records why.

## Nothing waits that doesn't have to

The run is event-driven. A piece of work starts the moment what it needs exists, not when a whole step has finished.

- **Features.** A feature starts the moment the features it depends on are done, even while unrelated features are still running.
- **Sequential build.** There's still one writer of product code, but nothing around it waits. While one task builds, a helper prepares the next task's brief, so each builder starts warm. As each task is committed, its tests run in the background, and a failure stops the tasks that depend on it straight away. The acceptance tests are written on their own branch while the code is being built.
- **Parallel build.** Each group starts the moment the groups it depends on have merged. Finished groups merge one at a time, in the order they finish.

The scheduler releases jobs in dependency order and serializes merges. Codex’s
controller dispatches the agents, and those agents execute the checks and git
operations described in their stage instructions.

## Checks along the way

- **An independent checker after every stage.** It tests the stage's exit list against the files and re-runs the commands the records cite as evidence. One repair round follows a failed check. A second failure stops that feature, with the reasons.
- **Gap review with two blind reviewers.** One asks what a builder would get wrong. The other asks what the plan requires that no task delivers. Neither sees the other's findings until both are written.
- **Falsification probes in verify.** For each criterion, verify disables the implementation, then cuts the entry point (the route, the subscription, the scheduled job). The test must fail both times. A test that stays green under a probe doesn't prove anything.
- **Verify sends work back.** A failed criterion reopens the tasks responsible, and the run builds them again, up to a set number of rounds.

## Tasks a builder can't misread

Each task carries everything inline:
- the outcome
- the acceptance criteria it serves
- the exact change
- the interfaces it uses, with signatures quoted
- a pattern to copy from your own repository
- the paths it may edit
- the examples it makes true, and a unit test for each
- a falsification probe

There's no "as in the plan". A builder never has to invent a name, a data shape or an error case.

## Records

Everything lives in plain files in your repository, so you can read, edit or overturn any of it:

```
.epic-flow/<feature>/
  brief.md            what and why
  technical-plan.md   how, with acceptance criteria
  tasks/001.md ...    self-contained tasks
  gaps.md             the gap review's verdict
  verify.md           each criterion: held, failed or not tested, with evidence
  questions.md        every question, its answer, and the rule that answered it
  status.md           the event log the run resumes from
```

The run resumes from `status.md`. Answer any open questions, run `$epic-flow-run` again, and each feature picks up where it stopped.

## Branches and delivery

- All work happens in `<repo>/.worktrees/<feature>/` on the feature's branch, cut from your base branch.
- It never commits on your base branch.
- It pushes or opens a PR only when you said so in delivery.
- When the time budget you set is spent, it starts nothing new and lets running work finish.

## Requirements

- Codex with local plugin support, native agent tools, and the persistent Node REPL
- A git repository
- `$epic-flow-run` uses the queue adapter described in [Codex runtime](codex-runtime.md). Independent checks require agent tools; missing capabilities are reported explicitly.

## Ideas it builds on

None of the parts are new: design by contract, contract-first interfaces, program slicing, merge trains, topological scheduling and falsification testing. What Epic Flow adds is running them together, end to end, unattended, and checking every step from the files.
