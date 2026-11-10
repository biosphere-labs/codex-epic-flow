# Epic Flow: Gaps

Read `conventions.md` in the plugin root (one level up from this file) before anything else.

Decompose brought the plan down to modules, interfaces and units. At that level new work shows up: wiring nobody listed, a migration, a config entry, an error path, a test. This stage finds it and adds it, so the build has nothing left to invent.

## Before you judge anything

Read the brief, the technical plan, every task, `questions.md`, the contract commit when there is one (`git show --stat <contract>` and the contract files), the repository's decision records, AGENTS.md and memory. Open every path the tasks cite. A conclusion that contradicts any of these is wrong until you show otherwise.

## Checks

- **Coverage.** Every acceptance criterion maps to one or more task ids, and every example under it (`AC-n.m`) is a unit test in a task's **Check**. A criterion with no edge or failure example gets one, from the answer order.
- **Scope.** Every task maps to a section of the technical plan.
- **Paths.** Every cited path exists, or is a new path the contract commit, a producing task, or the layout around it supports.
- **Contracts.** With a contract commit: every seam two tasks share is frozen in it, a task builds against the declaration, never a prose description of another task's code, and every declaration has a doc comment that states its behaviour and agrees with the task that fills it. With `contract: none`: every seam two tasks share is written out as a signature in exactly one producing task, quoted identically in every task that uses it, and each user `depends_on` the producer.
- **Wiring.** Every new component has a caller and an entry point. Every new route, subscription, bean, command or job is registered where the framework looks for it. Every contract declaration, or every seam a task produces, has a task that implements it.
- **Self-contained.** Every task carries its content inline. None points to another document or task for what to build ("as in the base spec").
- **Choices left open.** No task leaves a builder to invent a name, a data shape, an error behaviour or a check.
- **Platform fit.** Data formats, transports and libraries match what the platform already uses. A different choice has a reason from this code in the technical plan.
- **People.** No task or step is assigned to a person.
- **Order.** No cycle in `depends_on`. Every input a task needs is a frozen contract, a task it depends on, or code that exists.

## Independent review

After the checks, review the task set twice. Neither review sees the other's findings until both are written. Use a different model for each when the harness allows.

- One asks what a builder would get wrong or have to invent.
- The other asks what the technical plan requires that no task delivers.

Keep them as `notes/gaps-review-a.md` and `notes/gaps-review-b.md`. Reconcile them: a finding that fails a check above is a gap; the rest are notes.

## What this stage may change

- Add a task for work that emerges at this level of detail. Trace it to the plan section and the criteria it serves.
- Fix a task's content: the change, the pattern to follow, the check.
- Add an acceptance criterion the technical plan already implies, numbered after the last one.
- Correct a path you verified by opening it.
- Add `builds_against` or `depends_on`.
- For a missing seam with a contract commit, run a small contract wave: add the declaration with its doc comment and contract test, pass decompose's gate for it, and commit it on the feature branch and update `contract:` in the technical plan. With `contract: none`, write the seam into its producing task and quote it in each user.

It may not change a decision in the brief or the technical plan, or the scope. It does no build work: no merges of other branches, no product code, no environment setup.

After the edits, run the checks again (not the reviews) and add one to `round`.

## When to block

Block only on:

- a question the answer order in the conventions does not settle, or one that belongs to the user, or
- a design decision the technical plan never made that the answer order cannot settle.

Write each one to `questions.md` as `open` first. Everything else is a gap you fix.

## Write the record

Write `.epic-flow/<slug>/gaps.md`:

```yaml
---
name: <slug>
verdict: clear
round: 1
---
```

`clear` means every check holds after the edits. `blocked` means a question above is still `open`.

- **Edits.** Each task file added or changed, and why.
- **Coverage.** Each criterion, then its task ids.
- **Wiring.** Each new component or registration, then the task that wires it and the entry point it is reached from.
- **Findings.** Each remaining review note: what is wrong, which file, what would resolve it.
- **Unresolved.** Empty when `clear`. Otherwise the open question ids.

Alone, stop and name the build stage. Under the run, a `blocked` verdict returns `blocked`, and `status.md` is `waiting` with the question ids.

## Done when

- [ ] `gaps.md` exists with `verdict` `clear` or `blocked` and `round` of 1 or more.
- [ ] Coverage lists every AC in the technical plan, each with at least one task id that exists in `tasks/`.
- [ ] Every task has `criteria`, and every id in it is an AC in the technical plan.
- [ ] With a contract commit, every `builds_against` entry names a declaration present in it. With `contract: none`, every shared seam has one producing task, is quoted identically by each user, and each user `depends_on` the producer.
- [ ] Every `depends_on` id exists, and the ids form no cycle.
- [ ] Wiring names a task for each new component, route, subscription, bean, command or job the tasks add.
- [ ] No task points to another document for what to build, and none is assigned to a person.
- [ ] `notes/gaps-review-a.md` and `notes/gaps-review-b.md` exist.
- [ ] If `clear`, no question in `questions.md` is `open`. If `blocked`, every id under Unresolved is `open` in `questions.md`.
- [ ] `status.md` has a `gaps finished` or `gaps waiting` line.
