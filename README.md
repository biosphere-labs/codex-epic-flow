# Epic Flow for Codex

Epic Flow takes an idea through planning, decomposition, build and verification
in Codex. You settle the open questions and delivery choices at the start. Then
agents work through the stages, and a fresh agent checks each stage from the
files before the next one starts.

## Install

```sh
codex plugin marketplace add biosphere-labs/codex-epic-flow
codex plugin add codex-epic-flow@codex-epic-flow
```

Start a new Codex chat in your target repository. If the skills do not appear,
restart Codex. You can also install from a local checkout by passing its absolute
path to `codex plugin marketplace add`.

## Use

| Skill | What it does |
| --- | --- |
| `$epic-flow-idea` | Parks an idea in your words, without a planning session |
| `$epic-flow-run` | Runs or resumes one feature or many, across a range of stages |
| `$epic-flow-status` | Reads progress, open questions and the next stage |

For example, `$epic-flow-run saved-searches through gaps` stops after the gap
review. `$epic-flow-run saved-searches` continues through verification. Select
the skill in Codex’s skill picker if typing its name does not select it.

```mermaid
flowchart LR
    Idea --> Brainstorm --> Plan --> Decompose --> Gaps --> Build --> Verify
    Verify -->|failed criterion| Build
```

*The user settles the brief and delivery choices before unattended work starts.*

Each acceptance criterion carries concrete examples. Tasks copy the examples
they serve, and verification tests them through the application’s entry points.
A failed criterion reopens its tasks. The scheduler bounds the repair rounds.

Before building, you choose sequential or parallel delivery from estimates and
risk reasons. Parallel work starts from shared contracts and joins through a
merge train. Dependent tasks wait for their prerequisites’ tests; independent
work can proceed while those tests run.

## What runs where

The plugin packages skills, stage instructions, a dependency slicer and a
JavaScript scheduler. Its queue adapter runs in Codex’s persistent Node REPL.
The main Codex agent reads queued jobs, dispatches native agents, and submits
their structured results. The adapter validates those results and releases the
next jobs. No separate workflow service or model API key is required.

Records live in `.epic-flow/`. Code is built on feature branches in `.worktrees/`.
The workflow commits there and pushes or opens PRs only when Delivery authorizes
it. Codex’s permissions still apply, and a missing prerequisite can pause a run.

## Requirements and limits

Use Node.js 18 or newer, a git repository, and Codex with local plugin support.
Concurrent execution needs native agent tools and the persistent Node REPL.
The TypeScript slicer uses the target project’s TypeScript dependency.

The queue lives in the REPL’s memory. After interruption, inspect active agents
and worktrees before resuming from the records. There is no automatic continuation
after Codex shuts down. Without a separate checker agent, a stage cannot be
reported independently checked.

## Tests

```sh
node tests/flow.test.mjs
node --test tests/codex-flow.test.mjs
```

These tests cover scheduler control flow, queue transitions and result validation.
They use fake agent results, so passing them alone does not prove an application
can be built and accepted through an installed Codex session.

See [the workflow](docs/how-it-works.md), [the Codex controller](docs/codex-runtime.md)
and [privacy](PRIVACY.md). MIT licensed. Published by Biosphere Labs.
