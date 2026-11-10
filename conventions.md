# Epic Flow conventions

Every Epic Flow stage and the run workflow follow this file. It is the contract between the stages: where the records live, what their front matter holds, which status values exist, and who may change what. A stage's file says what that stage decides. This file says how the stages fit together.

## Stages

| # | Stage | Instructions | Needs | Writes |
| --- | --- | --- | --- | --- |
| 1 | Idea | `$epic-flow-idea` | an idea | `brief.md`, status `idea` |
| 2 | Brainstorm | `stages/brainstorm.md` | a parked idea, a draft, a plan file, a list, or an idea | `brief.md`, status `accepted` |
| 3 | Technical plan | `stages/technical-plan.md` | one or more accepted briefs | `technical-plan.md`, status `ready` |
| 4 | Decompose | `stages/decompose.md` | a `ready` technical plan | `tasks/NNN.md`, the contract commit or `contract: none` |
| 5 | Gaps | `stages/gaps.md` | the tasks, and the contract commit if any | `gaps.md`, edits to the tasks |
| 6 | Build | `stages/build.md` | gaps verdict `clear`, no `open` question | the code, task status |
| 7 | Verify | `stages/verify.md` | every task `closed` | `verify.md`, and closes the plan |

The plugin has three skills. `$epic-flow-run` runs any range of these stages on one feature or many, including a single stage. `$epic-flow-idea` parks an idea. `$epic-flow-status` reports where each feature is. Stages 2 to 7 are not separate skills: their instructions are the files in `stages/`, which the run reads.

`<plugin>` is the plugin root: the folder that holds this file, `stages/` and `scripts/`.

## Records

A feature's records live in `<repo>/.epic-flow/<slug>/`. `<repo>` is the main checkout: run `git rev-parse --show-toplevel` there, never inside a worktree. `<slug>` is kebab-case.

```
.epic-flow/<slug>/
  brief.md
  technical-plan.md
  tasks/001.md, 002.md, ...
  gaps.md
  verify.md
  questions.md
  status.md
  notes/          research, reviews and digests worth keeping on disk
```

A technical plan that combines several briefs gets its own slug. Its `briefs:` lists the source slugs, and each source brief gets `plan: <that slug>`.

## Front matter and status values

`brief.md`

```yaml
---
name: <slug>
status: idea | draft | accepted
plan: <slug of the combined plan, only when another plan took this brief>
---
```

`technical-plan.md`

```yaml
---
name: <slug>
briefs: [<slug>, ...]
status: ready | in-progress | closed
tests: with-code | first
contract: <sha of the contract commit, or none; written by decompose>
---
```

`tasks/NNN.md`

```yaml
---
title: <short name>
status: open | blocked | closed
level: 1 | 2 | 3
criteria: [AC-1, ...]
builds_against: [<contract declaration or path>, ...]
depends_on: [<task id>, ...]
---
```

`gaps.md`: `verdict: clear | blocked` and `round: <n>`.

`verify.md`: `result: passed | failed | waiting`.

- The technical plan's status is the epic's status. Only build sets `in-progress`. Only verify sets `closed`.
- `level` is the decompose pass that wrote the task: 1 modules and boundaries, 2 interfaces and data shapes, 3 units.
- `contract:` follows **Build shape**. For `parallel`, decompose writes compiling stubs and contract tests and commits them as the contract commit, so writers working at once share frozen seams. For `sequential`, there is no contract commit and `contract: none`: each seam is written out in the task that produces it (signature, data shape, errors) and quoted word for word in every task that uses it, which then `depends_on` the producer. One writer at a time needs no frozen stubs; the order protects the seams.
- `builds_against` names the frozen contract declarations a task imports, or, with `contract: none`, the existing code it imports (it may be empty). `depends_on` is for a task that needs another task's output that no contract covers. Two tasks touching the same file are not a dependency.
- A task is `blocked` when it needs a contract change or an answer. Its body says which.
- Gaps, build and verify may reopen a `closed` task by setting it to `open`, with one line under **Reopened** saying why and who reopened it.

## Acceptance criteria

The technical plan numbers them `AC-1`, `AC-2`, and so on. Decompose and gaps may add more and keep numbering. Each criterion says what is observable when it holds, and which test will prove it: the kind of test and the real entry point it goes through (the route, the subscription, the command, the scheduled job). A test that hands input straight to an inner function does not prove a criterion about the entry point.

Each criterion carries **examples**: concrete cases with real values, in the form given, when, then (the input or state, the action, the exact expected result). At least one shows the usual case and at least one an edge or failure case the criterion implies (empty, missing, too large, not allowed, already done). Examples are where ambiguity shows up: a value nobody can fill in is a question for the answer order. They flow down unchanged:

- the technical plan writes them under each criterion, numbered `AC-2.1`, `AC-2.2`
- decompose copies the ones a task serves into it, and its unit tests are those examples, plus any the task's own logic needs
- the acceptance test for a criterion runs its examples through the entry point
- gaps checks every example has a test; verify runs them all

Every task lists the criteria it serves in `criteria:`. Verify judges every criterion.

## Questions and the answer order

When a stage needs an answer, it tries these in order and takes the first that gives one:

1. What the user already said: this conversation, this feature's records, `questions.md`, AGENTS.md and memory.
2. The repository: code, docs, decision records, tests, git history.
3. A reference product the brief names (for example "what Jenkins does"), quoted with its source.
4. The default of the library, tool or platform involved.
5. The smaller, reversible option.

Write every answer to `questions.md` with the rule that gave it. An answer from rule 1 is `answered`. An answer from rules 2 to 5 is `assumed`; the user can overturn it later, and later stages treat it as decided.

These belong to the user: what the feature is for, who it serves, what is in or out of scope, credentials and accounts, and anything only a person can do. A question about one of these, or one the answer order does not settle, is `open`.

Never invent a person, owner, decider, team, approval or compliance step. When a record needs an owner, the owner is the user.

`questions.md` holds one entry per question:

```markdown
## Q-3 (open) Which branch does the PR target?
- Raised by: build
- Blocks: build
- Why it matters: the run may open a PR, and Delivery names none.
- Default if unanswered: no PR; the branch is left for the user.
- Answer:
- Source:
```

The status in the heading is `open`, `assumed` or `answered`. When a question is settled, change the heading and fill in **Answer** and **Source** in place.

A stage that meets an `open` question that blocks it writes it down, sets `status.md` to `waiting`, and stops that feature. Build never starts while any question in `questions.md` is `open`.

## Delivery

`brief.md` has a **Delivery** section, settled in brainstorm. In a run it is asked once for all features.

- **Base branch** the work starts from.
- **Branch** for the work. Default `epic/<slug>`.
- **Push**: yes or no. **PR**: no, or the branch it targets.
- **Time budget** for the unattended part, if there is one.
- **Prerequisites**: what the environment must have before build (accounts, registries, running services, secrets present as environment variables). Each one is checked before build starts.
- **Build shape**: `sequential` or `parallel`, chosen by the user from the options in **Build shape** below, with the estimate they chose from. Missing means build asks when it starts.

Version control:

- Work happens on the feature's branch in `<repo>/.worktrees/<slug>/`, cut from the tip of the base branch. A sequential build works only there. A parallel build's group worktrees are `<repo>/.worktrees/<slug>-<group>/` on branch `<branch>-<group>`.
- A combined plan takes Delivery from its briefs. When they disagree, that is an `open` question.
- With a contract commit, `notes/contract-gate.md` records the contract wave: the gate commands, their exit codes, and under **Contract files** every path it froze, each marked `whole` (nothing in it may change) or `declarations` (it holds stubs: only their bodies may change). Gaps and build read the list from there. Before the first worktree, check `git check-ignore -q .worktrees/x`; if it is not ignored, add `/.worktrees/` to `.git/info/exclude` and say so.
- Stages commit on the feature's branch and on build's group branches. Decompose commits the contracts, build the code, and verify the acceptance tests it adds (never product code). Never commit on the base branch. Never push or open a PR unless Delivery says so.
- No stage commits the records in `.epic-flow/`.

## status.md

One per feature. The run resumes from it.

```yaml
---
name: <slug>
stage: <stage it is in, or last finished>
state: running | waiting | stopped | done
---
```

Below the front matter, one line per event, newest last:

```
2026-10-13T14:02:11Z decompose started
2026-10-13T14:31:40Z decompose finished: 23 tasks, contract commit 4f1c2ab
2026-10-13T14:31:52Z gaps waiting: Q-4
```

Build also writes `task <id> started` and `task <id> closed` lines. Build shape estimates come from these lines and the stage lines.

Take the time from `date -u +%FT%TZ`. Each stage writes a line when it starts and when it ends, and sets the front matter both times: on start, `stage` to itself and `state` to `running`; on end, `state` to `done`, `waiting` or `stopped`. `waiting` names the question ids. `stopped` names what failed. `done` means the stage named in `stage` finished; an idea that is `done` is parked. A feature `waiting` at verify is not done.

## Running alone and under the run

- **Alone** (the user ran one stage interactively through `$epic-flow-run`): if the file this stage writes already exists, show what is there and ask before replacing it. At the end, stop and name the next stage.
- **Under `epic-flow-run`** (the prompt says so): nobody will answer during the run. Update existing records in place and log what changed in `status.md`. Never stop to ask for a go. End by returning one outcome:
  - `done`: the stage's **Done when** list holds.
  - `waiting`: an `open` question blocks it; the ids are in `status.md`.
  - `blocked`: gaps wrote verdict `blocked`, and `status.md` is `waiting` with the question ids.
  - `failed`: verify ran and a criterion failed or was not tested; the responsible tasks are reopened.
  - `error`: the stage could not finish; say what stopped it.

After each stage, the run has an independent checker test that stage's **Done when** list against the files. The stage's own summary counts for nothing.

## Every stage

- Read this file and every record that exists for the feature.
- What you know about the project comes from the repository, these records and what the user said.
- Name only paths and symbols you opened.
- Omit a section that would be empty.
- Never assign a task or a step to a person. A step only a person can do becomes a Delivery prerequisite or an `open` question.
- Report progress from measured events only: what finished, with the times in `status.md`. Never describe work as happening unless an agent is running it.
- Each stage skill ends with **Done when**: the exit list the checker tests.

## Serial where dependent, parallel where independent

- Build the dependence graph first. Work that needs another's result runs after it: a task or group after the ones it depends on, a feature after the features named in its `after`. Only work with no path between them runs at once.
- When the dependence is unknown, say so in the records and run serially. Never guess parallel.
- Two tasks touching the same file are not a dependency, but they share a writer (one group).

## Build shape

The user always chooses how build runs, and chooses when the work starts: in the `epic-flow-run` question session, or when decompose or build runs alone without one. Nothing asks them later. Once chosen, the run is unattended. The choice shapes decompose too: `parallel` gets a contract commit, `sequential` gets `contract: none` and a faster decompose. Say so in each option's description.

**Shape analysis.** Do it read-only and fast, to get to the choice quickly.

- When `tasks/` exists, use the real tasks: count the `open` ones, group them as build's **Groups** section says, and find the longest chain.
- Otherwise, sketch from `technical-plan.md`, or from `brief.md` when there is no plan. Name the parts the work splits into, which parts need another's result, a rough task count per part, and the longest chain. Say that it is a sketch. An epic can be a whole app: sketch at the level of the plan's components and their data flow, open only the paths the plan names, and run one read-only agent per feature at once so the choice comes quickly.

**Machine.** Read the core count (`sysctl -n hw.ncpu` or `nproc`) and the load average (`uptime`). Time the project's test suite once and keep the result in `<repo>/.epic-flow/machine.md` with the date. Re-time it when it is more than seven days old. Agents can run at once up to `max(1, floor((cores - load) / 2))`, and never more than the number of independent groups.

**Time per task.** Take the median and the 75th percentile of `task <id> started` to `task <id> closed` across every `<repo>/.epic-flow/*/status.md`. When fewer than five tasks have been timed, use 10 and 15 minutes and label the estimate "assumed, not measured". Never present an assumed figure as measured.

**Estimates.** Give each as a range: the low end from the median, the high end from the 75th percentile. Over dozens of tasks one number hides how unsure it is.

- Sequential: open tasks × time per task + one suite run.
- Parallel: the larger of the longest chain and (open tasks ÷ agents at once), × time per task × (1 + load / cores), + 3 minutes setup per group + one suite run per group for the merge train.
- When the range includes stages before build, add each stage's median measured duration from `status.md` lines, or say there is none.

**Risk.** Give each option a level (low, medium or high) and every reason that raised it.

- Sequential is low. Medium when its estimate exceeds the Delivery time budget.
- Parallel is high when the model running the build is not the most capable tier (for example a smaller model selected for speed; if the model is unknown, record that uncertainty) and the work is complex: a group of more than three tasks, a level 2 task, or seams shared by three or more groups. Name the model.
- Parallel is high when the dependence between two groups is unknown.
- Parallel is medium when the shape is a sketch (the real graph may not split, and build then runs sequentially), when more than one group in four has a `depends_on` edge to another group (the train then serialises much of the work and retests often), or when tests hold a fixed port or a shared service.
- Otherwise parallel is low.

**The choice.** Always offer both options, even when parallel saves nothing; the numbers show it. Use the host’s user-input tool when available, otherwise ask in chat, header the feature's slug, each option's label `Sequential` or `Parallel (<n> agents)`, and its description the time, the risk level and the reasons. Put the lower-risk option first when the times are within 20% of each other, otherwise the faster one. Write the choice and its estimate to **Build shape** in Delivery. Where a rule says "the lower-risk shape", a tie goes to sequential.

**Following it.** Decompose and build follow **Build shape** without asking. When `parallel` was chosen but the real graph has one group, or a dependence between groups is unknown, build runs sequentially on the contract commit and writes the reason to `status.md` and its report. A change from `sequential` to `parallel` after decompose needs a contract wave first: build offers that only when it starts alone, with the wave's time added to the parallel estimate.
