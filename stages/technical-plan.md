# Epic Flow: Technical plan

Read `conventions.md` in the plugin root (one level up from this file) before anything else.

Turn accepted briefs into a plan of this change in this codebase. Stay high level: components, boundaries, and how they sit next to what exists. Decompose turns it into code structures and tasks.

## How to work

1. Read every brief this plan builds. Each must be `accepted`. If one is `idea` or `draft`, stop and name the brainstorm stage. Several briefs make one combined plan with its own slug: list them in `briefs:` and set `plan: <slug>` in each source brief.
2. Read `questions.md` for each brief. Every `answered` and `assumed` entry is decided. An `open` entry that this plan depends on stops the plan.
3. Plan against the tip of the Delivery base branch. Run `git fetch` when there is a remote, then read the code at `<base>`, not whatever branch the main checkout has open. Record the sha you read in **Builds**.
4. Find where the change lives. Open the modules it touches, the patterns around them, and the docs that define current behaviour. Name only paths and types you opened.
5. For every data format, transport, library and pattern the plan uses, find what the platform already uses for the same job and follow it. Open the code that shows it. A different choice needs a reason from this code, written in **Decisions**.
6. Write the behaviour first: the primary flow, the failures that matter, and what stays the same.
7. Name the components. For each one, decide how it is encapsulated and why, and whether it builds on top of an existing path, beside it, or instead of it.
8. Write acceptance criteria per the conventions. Each one is observable, names the kind of test, and names the real entry point the test goes through. Under each, write its examples: given, when, then, with real values, at least one usual case and one edge or failure case. A value you cannot fill in is a question for the answer order.
9. Smaller-change pass. Look for a smaller change in the code you read that still meets every criterion. Take it only when it keeps every brief item and every decision the user made. Record what you cut and why. Never drop a brief item to make the plan smaller.
10. When a question comes up, use the answer order in the conventions and write the result to `questions.md`.

There is no cap on size. A plan that packs many features is normal. Do not stop to split it.

## Write the plan

Write `.epic-flow/<slug>/technical-plan.md`:

```yaml
---
name: <slug>
briefs: [<slug>, ...]
status: ready
tests: with-code
---
```

`tests` is `with-code` unless the brief or the user asked for tests first. Leave `contract:` out; decompose writes it.

- **Builds.** One paragraph per brief this plan carries, and the base branch and sha the plan was read against.
- **Behaviour.** Numbered primary flow, then the failures worth handling, then what stays the same.
- **Components.** One entry per component: what it does, how it is encapsulated and why, and which existing paths it sits on top of, beside, or instead of.
- **Decisions.** The choice, the trade-off in plain terms, and where it came from: the brief decision it carries, or the code that gives the reason for a new one.
- **Acceptance criteria.** `AC-1`, `AC-2`, and so on. Each line: what is observable when it holds, the kind of test, and the entry point it goes through. Under each, its examples `AC-n.1`, `AC-n.2`, as given, when, then with real values.
- **Tests.** `with-code` or `first`, and the test commands this project already uses for the areas touched.
- **Not doing.** Only what a brief put out of scope, and what the smaller-change pass cut. Each item says why.
- **Risks.** What could make the approach wrong, and what you would do then.
- **Areas.** Optional. The areas decompose will expand, as names only.

## Under epic-flow-run

An `open` question the plan depends on sets `status.md` to `waiting` and returns `waiting`.

## Done when

- [ ] `.epic-flow/<slug>/technical-plan.md` exists with `name`, `briefs`, `status: ready` and `tests` in front matter.
- [ ] Every slug in `briefs:` has a `brief.md` with `status: accepted`. For a combined plan, each of those briefs has `plan: <slug>`.
- [ ] **Builds** names the base branch and the sha the plan was read against.
- [ ] Every component in **Components** says on top of, beside or instead of, and names at least one existing path that exists at that sha, or says it is new.
- [ ] Every acceptance criterion has an id `AC-n`, an observable outcome, a test kind and an entry point, and at least two examples with real values, one of them an edge or failure case.
- [ ] Every decision in **Decisions** names its source: a brief decision or code in this repository.
- [ ] Every item in each brief's scope is either covered by an acceptance criterion or listed in **Not doing** with the brief as its source.
- [ ] No question in `questions.md` that this plan depends on is `open`.
- [ ] `status.md` has a `technical-plan started` line and a `technical-plan finished` line.
