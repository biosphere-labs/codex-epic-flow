# Epic Flow: Build

Read `conventions.md` in the plugin root (one level up from this file) before anything else.

Build the tasks against the contract commit, or, with `contract: none`, against the seams the tasks write out. The technical plan and the task files are the spec.

## Before you start

1. `gaps.md` has verdict `clear`. If not, stop and name the gaps stage.
2. No question in `questions.md` is `open`.
3. Check every Delivery prerequisite in the brief with a command that shows it is there: reach the registry, reach the service, see that the variable is set without printing its value. A missing one becomes an `open` question naming what is missing. Set `status.md` to `waiting` and stop.
4. `<repo>/.worktrees/<slug>/` is on the Delivery branch, and `contract:` is `none` or names a commit the branch contains. If not, stop and name the decompose stage.
5. If the user said how to shape the build (two tasks per agent, a number of agents, an order), follow it. If the dependence graph makes it wrong, say why before deviating: alone, ask; under the run, write the reason to `status.md` and the report.
6. Set the technical plan's status to `in-progress`.

## Choose the shape

Build the dependence graph and the groups as **Groups** below says. Both shapes need them: sequential takes its order from them.

- **Alone**: do the shape analysis in the conventions' **Build shape** with the real tasks, and offer both options with their time, risk and reasons, putting the Delivery **Build shape** first when there is one. Write the user's choice to Delivery.
- **Under the run**: follow Delivery **Build shape** without asking. When it is missing, run sequentially and write that reason.
- Either way, when `parallel` was chosen but there is one group, or a dependence between groups is unknown, run sequentially and write the reason to `status.md`.
- With `contract: none`, parallel needs a contract wave first. Alone, the Parallel option includes it: its time is added to the estimate, and choosing it runs decompose's parallel level 2 for the open tasks' seams before the groups start. Under the run, build stays sequential and writes the reason.

Write `build shape: <sequential|parallel>, <n> tasks, <n> groups, <reason when it differs from Delivery>` to `status.md`.

## Groups

- The unit of grouping is the dependence slice: an entry point, everything it calls, and the data shapes that flow along those calls. Files are storage: two functions in one file can be unrelated, and a function and its caller usually live in different files.
- Run `<plugin>/scripts/slice.mjs` with each `open` task's entry points and every frozen contract declaration (`--frozen`), where the language allows (TypeScript; run it with no arguments for its usage). A frozen node is a boundary: the walk stops there and it links no tasks. Add edges it cannot see with `--edge` (functions chosen at runtime, event emitters, dependency injection, dynamic imports, HTTP, files, the database). Elsewhere, group by calls and the data they pass. Say which edges you added by hand.
- A large group's `sharedNodes` are the candidates to freeze next; freezing is what buys parallelism. On a fresh skeleton, stubs have no bodies, so slices under-group: group by aggregate instead, one group per aggregate with the use cases that change it.
- Build the dependence graph from the slices, `builds_against` and `depends_on`. A group that needs another group's result (an output no frozen contract covers) runs after it. When you cannot tell whether two groups depend on each other, write "dependence unknown".
- Tasks whose slices share an unfrozen node are one group with one writer. Never group by file, by task id order, or in fixed pairs.
- Write `notes/build-groups.md`: the shape, each group's name, its task ids, the contracts it imports, and the groups it runs after (or "dependence unknown"). For a sequential build, also the task order.
- On a rerun after verify reopened tasks, build only the `open` tasks, in the shape already in Delivery.

## Working ahead

The build is driven by events: each piece of work starts the moment what it needs exists, not when a whole step has finished. Under `epic-flow-run`, the run’s Codex queue adapter drives the scheduler and gives each agent one part. Alone, do the same with background agents (Codex’s native agent tools).

### Prepare ahead

While one task builds, a read-only agent prepares the next one's brief in `notes/briefs/<id>.md`: the task's text and examples, the files to open with the lines that matter quoted, the pattern to follow, and the seams it uses with their signatures. A builder starts from it instead of from a cold read. Anything a task still building could change is marked "check after <id>"; the builder confirms it.

### Test as each task lands

When a task is committed, a background agent runs that task's tests and its examples, in a scratch worktree at the feature branch tip, while the next task builds. A failure sets the task `open` with the diagnostic under **Check**, and the tasks that depend on it are not started. A break shows minutes after it lands, not at the end.

### Acceptance tests during the build

While the code is built, one agent writes the acceptance test for each criterion from its examples, through its entry point, against the seams the tasks and contracts define. It works in `<repo>/.worktrees/<slug>-acceptance/` on branch `<branch>-acceptance`, cut from the feature branch, commits there, and touches no product code. Verify merges that branch and runs the tests instead of writing them.

## Sequential

- Work only in `<repo>/.worktrees/<slug>/` on the feature branch. No group worktrees, no group branches, no merge train.
- Order: a topological order of the groups, and inside each group of its tasks by `depends_on`; ties by task id. Give each task's `depends_on` with the order, so a failure can stop exactly the tasks that need it.
- One fresh agent per task, one product-code writer at a time. Its brief carries everything inline: the prepared brief when there is one, the task's text, its criteria and examples, the contract files to import, the paths it may edit, and the check. When Codex’s agent tools are not available, do the tasks yourself in the same order.
- Write `task <id> started` before the agent starts and `task <id> closed` when its check holds.
- Each task: change bodies and private helpers, and, with `contract: none`, add the declarations it produces exactly as its **Change** writes them. Run its check and its falsification probe (the check fails with the implementation disabled and passes with it in place), then commit on the feature branch.
- A task whose check fails, here or when its tests run after it lands, stays `open`. Skip every task that depends on it, directly or through its group, and go on with the rest.
- A task that needs a seam changed: set it `blocked` with `contract change: <declaration>: <why>`. With a contract commit, run a small contract wave for that declaration only. With `contract: none`, rewrite the seam in its producing task and in every task that quotes it, and reopen any `closed` one that it changes. Then continue from that task.
- After the last task: the compile or type check, the contract tests, and the full suite on the feature branch. A failure reopens the tasks whose code it points to, with the diagnostic under **Check**.

## Parallel

### Infill

- A group starts as soon as every contract it imports has merged and every group it depends on has merged. Nothing waits for a wave, and nothing starts before its dependencies.
- One agent per group, in `<repo>/.worktrees/<slug>-<group>/` on branch `<branch>-<group>`, cut from the feature branch tip. Never start a second builder on a group that has one. Within a group, the writer works from the entry point down, so each caller and its callee are written in the same context.
- The brief carries everything inline: the tasks' text, their criteria, the contract files to import, the paths it may edit, and the checks.
- The writer writes `task <id> started` and `task <id> closed` lines to `status.md` in the main checkout, or returns their times for you to write.
- Writers change function bodies and private helpers. A writer that needs a contract change stops and reports `contract change: <declaration>: <why>`. Set that task `blocked` with the line, run a small contract wave for that declaration only, re-run the slices, and restart only the groups that reach it.
- Each writer runs its own tasks' checks and their falsification probe. It does not run the full suite.
- A test that holds a fixed port or a shared service (a mail server on a fixed port, a shared database, a fixed container name) cannot run in two groups at once. Hold it for the train.
- Concurrency is the number of agents the shape analysis allowed, lowered when the account quota or the machine's load requires it.

### Merge train

- Merge finished groups one at a time, in the order they finish. Test each on top of the feature branch tip and merge it when every check passes. The moment a group merges, start every group that was waiting only for it.
- A failure goes back to its group once, with the exact diagnostic. A group that fails the train twice stops, and so do the groups waiting for it.
- Checks at the train: the merge, the compile or type check, the contract tests, the tests held back from the groups, the full suite.
- No agent reconciles two diffs at the join.
- A textual conflict inside one function means two groups owned the same node. Regroup; do not patch it at the join.
- After the train, deduplicate convenience helpers that groups wrote separately, checked by the suite staying green before and after.

## The contract holds

With `contract: none`, every seam in the code matches the signature its producing task wrote, as last rewritten. With a contract commit, in both shapes, by the marks in `notes/contract-gate.md`: `git diff <contract>` is empty for each `whole` file, and for each `declarations` file it touches only stub bodies (no exported declaration, signature or type changes). Any other change came from a contract wave.

## Task status

- A task closes only when its check holds on the feature branch (after its merge, when parallel). Write the command, the exit code and the result under **Check** in the task file.
- A failed check leaves the task `open`, with the failure under **Check**.
- When the code and a task disagree, leave the task `open`, write what disagrees, and send it back to gaps before building it.

## Time budget

When the Delivery time budget is spent, counted from the `build started` line in `status.md`, start no new task or group. Let running ones finish and merge. Write `budget spent` and the `open` task ids to `status.md`.

## Delivery

- Commit on the feature branch, and on group branches when parallel. Never on the base branch.
- Push and open a PR only when Delivery says so, against the branch it names. The PR body lists each acceptance criterion, the tasks that serve it, and their check results.

## Progress

Report only what has finished, from `status.md` and git: tasks closed and groups merged, with times. Never describe a task or group as running unless its agent is running.

## When the build ends

When every task is `closed`, leave the technical plan `in-progress`. Alone, stop and name the verify stage. Under the run, return `done`. If tasks stay `open` because a check failed or the budget ran out, return `error` with their ids.

## Done when

- [ ] The technical plan's status is `in-progress`.
- [ ] `status.md` has a `build shape:` line, and it matches Delivery **Build shape** or gives the reason it does not.
- [ ] Every task has status `closed`, with a command, an exit code and a result under **Check**.
- [ ] Every task has `task <id> started` and `task <id> closed` lines in `status.md`.
- [ ] `notes/build-groups.md` names the shape and lists every task id in exactly one group, and gives the task order when sequential.
- [ ] When sequential, the only `<repo>/.worktrees/<slug>-*` worktree or `<branch>-*` branch this build left is the acceptance one; scratch test worktrees were removed.
- [ ] With a contract commit: the feature branch in `<repo>/.worktrees/<slug>/` contains it and has commits after it; `git diff <contract>` is empty for each `whole` contract file and touches only stub bodies in each `declarations` file, or `status.md` records a contract wave for each changed declaration.
- [ ] With `contract: none`: the feature branch has a commit for each closed task, and each seam a task produced exists in the code with the signature that task wrote.
- [ ] No commit this build made on the feature branch is on the base branch.
- [ ] If Delivery says no push, the feature branch has no upstream. If a PR was opened, its URL is in `status.md`.
- [ ] When an acceptance branch was written, it exists as `<branch>-acceptance` with a commit, and it changes only test files.
- [ ] `status.md` has a `build finished` line.
