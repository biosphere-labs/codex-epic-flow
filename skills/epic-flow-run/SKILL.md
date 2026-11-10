---
name: epic-flow-run
description: >
  Run Epic Flow over one feature or many, across any range of stages
  (brainstorm, technical plan, decompose, gaps, build, verify), or a single
  stage with the user present: one question session up front, then the rest
  unattended, each stage checked from the files. Use when the user runs
  $epic-flow-run, or asks to run Epic Flow, take Epic Flow features through
  to build, resume an Epic Flow run, or run one Epic Flow stage.
---

# Epic Flow: Run

Read `conventions.md` in the plugin root (two levels up from this skill's base directory) before anything else. `<plugin>` below is that root. Each stage's instructions are in `<plugin>/stages/<stage>.md`.

Take features through a range of stages without the user starting each one. They answer questions once, up front, and can leave. This skill gathers the features, runs the question session, starts the workflow, and reports.

## 1. What to run on, and how far

What, in any mix:

- Slugs of features in `.epic-flow/`.
- Parked ideas, plan files, or a folder of them.
- A pasted list of ideas. Each item is parked first, as `$epic-flow-idea` writes it.
- Nothing: every feature in `.epic-flow/` whose technical plan is not `closed`.

How far, in the user's words: "through decompose", "from gaps", "only verify", "stop before build". No range means each feature from its next stage through verify. One range applies to every feature unless they name one per feature.

**One stage, with the user here.** When the range is a single stage for one feature ("only gaps", "just brainstorm", "decompose this one") and the user has not said to leave it unattended, run that stage in this conversation: read `<plugin>/stages/<stage>.md` and follow it as the conventions' **Alone** says. Skip the workflow and the steps below. Brainstorm always runs this way for a single feature: it is a conversation with the user.

## 2. Where each feature is

Take each feature's next stage from `status.md`. When `status.md` is missing, take it from the records:

| Records | Next stage |
| --- | --- |
| brief `idea` or `draft`, or a file or idea with no brief | brainstorm |
| brief `accepted`, no `technical-plan.md` | technical-plan |
| plan `ready`, no `contract:` | decompose |
| `contract:` set (a sha or `none`), no `gaps.md`, or verdict `blocked` | gaps |
| verdict `clear`, a task `open` or `blocked` | build |
| every task `closed`, `verify.md` missing or not `passed` | verify |
| plan `closed` | nothing; leave it out |

A feature whose `status.md` is `waiting` goes to the question session with its open questions, then resumes at that stage. A feature whose next stage lies past the end of the range is left out.

Show one line per feature: slug, next stage, last stage in this run. Go on without asking; the question session is where the user changes it.

## 3. Develop the briefs

Only features whose next stage is `brainstorm` enter develop mode. Leave accepted
briefs for features resuming at technical-plan, decompose, gaps, build or verify
unchanged. If no feature needs brainstorm, skip develop mode and proceed to the
question session for any existing open questions and missing Delivery choices.

Read `<plugin>/docs/codex-runtime.md`. Start its queue adapter in the persistent Node REPL with only those brainstorm features:

```js
var epicFlow = startFlow({
  mode: 'develop', repo: '<repo>', pluginRoot: '<plugin>',
  unattended: false, // true only when the user said not to ask them
  features: [{ slug: '<slug>', source: '<path of the parked brief, plan or list file>' }]
});
```

Drive the queued jobs with Codex's native agent tools as the runtime guide says.
Collect the develop results before the question session.

Per feature, a questioner drafts the brief and its questions, and an answerer from a fresh context answers them by the answer order. Two rounds at most. Each result gives the brief's path, a two-line summary, the questions still open for the user with a recommended answer, and how many answers were assumed.

## 4. The question session

From here the main conversation writes `brief.md` and `questions.md` in place of the questioner.

1. One line per feature: what its draft says it is, and how many answers were assumed. Give the brief's full path.
2. Every open question across all features, including those from `waiting` features. Use the host’s user-input tool when available, otherwise ask in chat, within the tool’s supported question limit, recommended answer first, header the feature's slug. A question with no sensible options goes in plain text.
3. **Delivery**, once for all features, with "same for all" offered: base branch, branch, push, PR target, time budget, prerequisites.
4. **Build shape**, for every feature whose range includes decompose or build. It decides decompose's output too (a contract commit or `contract: none`). Do the shape analysis in the conventions' **Build shape** first: one read-only agent per feature, all in one message, each returning its groups, longest chain and risk reasons, while you read the machine and the timings once. Then offer each feature its Sequential and Parallel options, each with its time range, risk and reasons, and write the choice to its Delivery. This is the last question of the run: once the user has chosen, nothing asks them again.
5. When the user adds detail instead of answering, fold it into that brief and ask only what remains. When the user says "best guess", "use your defaults" or "don't ask me", settle the rest as brainstorm step 5 says, and take the lower-risk build shape.
6. Write each answer into `questions.md` with **Source** "the user, run question session". Set a brief to `accepted` when none of its questions is `open` and it has an approach. A feature with a question still open stays `draft` and leaves this run; say which.

Skip the session when the user said not to ask them. Features with an `open` question then stay where they are, and each feature without a **Build shape** gets the lower-risk one, written to Delivery with its estimate and "chosen by the run: the user asked not to be asked".

## 5. The unattended part

Start a new queue in flow mode with every feature ready for a stage in the range:

```js
var epicFlow = startFlow({
  mode: 'flow', repo: '<repo>', pluginRoot: '<plugin>', verifyRounds: 2,
  features: [{ slug: '<slug>', from: '<first stage>', to: '<last stage>', after: ['<slug it needs>'] }]
});
```

Drive this queue through completion following `docs/codex-runtime.md`. The adapter
uses the original event-driven scheduler; Codex performs the requested agent jobs.

`from` and `to` are among `technical-plan`, `decompose`, `gaps`, `build`, `verify`. Each feature runs its stages in order. Features that do not depend on each other run at once. A feature with `after` waits until those features are done, and is not started if one of them stopped. Set `after` from the briefs and plans: a feature that needs another's result comes after it. When you cannot tell whether two features depend on each other, say so and chain them with `after` rather than guess they are independent. After each stage an independent checker tests that stage's **Done when** against the files, and one repair round follows a failed check. A `waiting` or `blocked` stage stops that feature and the others go on. A failed verify sends the feature back to build, at most `verifyRounds` times. The workflow is event-driven: a feature starts the moment the features it needs are done, and inside build each piece starts the moment its inputs exist (the next task's brief is prepared while the current task builds, each task's tests run as it lands, the acceptance tests are written alongside the build, and a parallel group starts the moment the groups it needs have merged).

Before starting it, tell the user in one line how many features and which ranges, and that they can leave. Give no time estimate unless one comes from measured runs on this machine.

When the queue or agent tools are unavailable, follow the runtime guide's explicit
fallback and report which independent or concurrent work could not run.

## 6. Report

When the workflow returns, per feature:

- The stage it reached and its outcome, with the times from `status.md`.
- Its open questions, in full.
- The branch, the worktree's full path, and the PR link when one was opened.
- `verify.md` result when verify ran.

Then one line: answer the questions and run `$epic-flow-run` again; each feature resumes from its `status.md`.

## Done when

- [ ] Every feature in the run has a `status.md` whose last line is later than the run's start.
- [ ] Every feature that left the run early has its reason in `status.md` or in the report.
- [ ] Every brief the question session accepted has no `open` question in `questions.md`.
- [ ] Every feature whose range includes decompose or build has **Build shape** in its Delivery, with the estimate it was chosen from, before the unattended part starts.
- [ ] The report names each feature's stage, outcome, open questions and branch.
