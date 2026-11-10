# Epic Flow: Decompose

Read `conventions.md` in the plugin root (one level up from this file) before anything else.

Add detail one level at a time until a builder can execute every task without the planning conversation. At each level, the work that is now fully specified becomes a task. The rest goes down to the next level. The builder should never have to invent a path, a name, a data shape, an error case or a check.

## Before the first level

1. Read `technical-plan.md`. If it is missing or not `ready`, stop and name the technical plan stage.
2. Read every brief in `briefs:` and `questions.md`. Take the base branch and branch from Delivery. If the briefs' Delivery sections disagree, that is an `open` question.
3. Create `<repo>/.worktrees/<slug>/` on the Delivery branch, cut from the tip of the base branch. Reuse it if it exists.
4. Open every path the plan names, and the nearest existing code a builder should copy from.
5. Take **Build shape** from Delivery. When it is missing: alone, do the shape analysis in the conventions from the plan and offer the choice; under the run, use `parallel`, which keeps both shapes open, and write that reason to `status.md`.

## Level 1: modules and boundaries

Name each module or package the plan's components become, its public surface in words, and what it may depend on. Write a task for work that is fully specified at this level, such as registering a new module or adding build configuration. Everything else waits for level 2.

## Level 2: interfaces and data shapes

### Sequential: in the tasks

- Write every seam into the task that produces it, under **Change**: the exact signature in the project's language, the data shape, the error and null behaviour, and the criteria it serves. Each rule comes from the brief, the plan or `questions.md`; nothing in it is new.
- Every task that uses the seam quotes it word for word under **Builds against** and lists the producer in `depends_on`.
- When `tests` is `first`, write a task for each acceptance test, through its entry point, ordered before the tasks it proves.
- Commit nothing. Write `contract: none` to `technical-plan.md`.

### Parallel: as code, the contract commit

Several writers will build at once, and a model fills whatever it cannot see by guessing. Two writers working from a prose description of the same seam guess differently (a field name, argument order, `null` against an empty list), and the merge pays for every difference. So every seam exists as compiling code before any writer starts. The interfaces are written down here, not designed here: they come from the plan, `questions.md`, a reference product the brief names, or, when the plan gives only requirements, domain-driven design as `ddd-design.md` (beside this file) describes.

- **Find every seam.** Where the language allows, run `<plugin>/scripts/slice.mjs` (TypeScript; run it with no arguments for its usage) over the existing code with each criterion's entry points as one task. Every node in its `sharedNodes` is reached by more than one task and is a seam. Add the new seams the plan names that no code has yet (a new route, record or callback), and every seam that crosses an untyped boundary. Edges the analysis cannot see (functions chosen at runtime, event emitters, dependency injection, dynamic imports, HTTP, files, the database) are added by hand; say which in `notes/contract-gate.md`. Other stacks: the IDE call hierarchy, Joern, CodeQL or WALA.
- **Untyped boundaries.** For a seam across HTTP, a JSON file, a database row, CLI output or untyped JavaScript, both sides import one shared schema or type (JSDoc with `checkJs` for plain JS), and each side gets a contract test reading the same fixture, produced by running the real producer. A hand-written mock is not that fixture.
- What a contract needs, with an example and a checklist: `contracts.md`, beside this file.

- Write every seam as code that compiles: types, records, wire schemas, signatures, the error and null conventions, and stub bodies that throw the project's internal-gap marker (for example `FIXME[internal]`). This wave also decides each declaration's path; that is the only place paths are chosen.
- Give every declaration a doc comment, in the project's own doc style, that a builder can fill the body from without the task file: what it does, its preconditions and postconditions, what it throws or returns on failure, and the acceptance criteria it serves. Each rule in it comes from the brief, the plan or `questions.md`; nothing in it is new.
- Write contract tests against the stubs. When `tests` is `first`, also write each acceptance test now, through its entry point.
- Gate: the type check passes, every contract test fails on the stub with an assertion or the stub's throw (never a compile error), and when the contracts came from domain-driven design, rules R1 to R9 in `ddd-design.md` hold. Write the commands, their exit codes and the failing test names to `notes/contract-gate.md`, and under **Contract files** every path the contract wave wrote, each marked `whole` or `declarations` as the conventions say.
- Commit the contract wave on the branch. Write its sha to `contract:` in `technical-plan.md`.

Write a task for work that is fully specified by these interfaces, such as a migration from a data shape or wiring an entry point to a stub.

## Level 3: units

Inside each boundary, name the classes, functions and handlers that fill the stubs, or, when sequential, that implement the seams the tasks specify. Write a task for each piece of work a builder can do behind them.

## Every task

Write `.epic-flow/<slug>/tasks/001.md` and onward, numbered across all levels.

```yaml
---
title: <short name>
status: open
level: 3
criteria: [AC-2]
builds_against: [<declaration or path in the contract commit, or existing code when contract is none>, ...]
depends_on: []
---
```

- **Outcome.** What is true when this task is finished.
- **Criteria.** The acceptance criteria it serves, each quoted in full with the examples this task makes true.
- **Change.** Files to add or edit, and what changes in each, with names, data shapes and error behaviour written out.
- **Builds against.** The contract declarations it imports, or with `contract: none` the seams and existing code it uses, with their signatures quoted.
- **Depends on.** When it needs output no contract covers. One line per id saying what it needs. Sharing a file is never a reason.
- **Follow.** The existing file to copy from and the specific pattern. Quote a short fragment from this repository. Never a sample from another stack.
- **May edit** and **Leave alone.** Paths. A level 3 task edits bodies and private helpers, never an exported declaration or a contract test. With `contract: none`, a task may add the declarations it produces, and no others.
- **Check.** The unit tests, one per example under **Criteria** plus any the task's own logic needs (each as given, when, then with real values), and the real entry point they go through when the task serves a criterion. Then the falsification probe: what to disable, and the test that must then fail.

Each task carries everything inline. No "as in the plan", no pointer to another document for its content. Size each one so its brief holds a similar, self-contained load of context: split a task a builder could not hold in one context, and join tasks that are one change.

Never write a task for a person. A step only a person can do becomes a Delivery prerequisite or an `open` question.

When a level shows an observable behaviour no criterion covers, add the next `AC-n` to `technical-plan.md`. Change nothing else in the plan. When a level needs a decision the plan did not make, use the answer order; if it stays `open`, stop.

## Under epic-flow-run

An `open` question sets `status.md` to `waiting` and returns `waiting`.

## Done when

- [ ] `<repo>/.worktrees/<slug>/` exists on the Delivery branch.
- [ ] `technical-plan.md` has `contract:` set to a commit on that branch when **Build shape** is `parallel` (or was missing), and to `none` when it is `sequential`.
- [ ] With a contract commit: `notes/contract-gate.md` records a passing type check and every contract test failing on the stub, with commands and exit codes, at that commit, and lists the **Contract files**; every entry in `builds_against:` exists in it; and every declaration in it has a doc comment with what it does, its preconditions and postconditions, its failure behaviour and the criteria it serves.
- [ ] With `contract: none`: no commit was made, every seam is written out in one producing task's **Change**, and every task that uses it quotes it identically and lists the producer in `depends_on`.
- [ ] Every task has `title`, `status: open`, `level` in 1 to 3, a non-empty `criteria`, `builds_against` and `depends_on`.
- [ ] Every id in `criteria:` exists in `technical-plan.md`, and every criterion there is listed by at least one task.
- [ ] Every id in `depends_on:` exists, has a reason under **Depends on**, and the graph has no cycle.
- [ ] Every task has non-empty **Outcome**, **Change**, **Follow**, **May edit** and **Check** sections, and **Check** names a test and a falsification probe.
- [ ] No task is assigned to a person or points to another document for its content.
- [ ] `status.md` has a `decompose started` line and a `decompose finished` line with the task count and the contract sha or `contract none`.
