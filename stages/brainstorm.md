# Epic Flow: Brainstorm

Read `conventions.md` in the plugin root (one level up from this file) before anything else.

Turn an idea into a brief the technical plan can build on. This stage decides the problem, the approach, what success means, and how the work is delivered. It stops at the approach. The technical plan chooses files.

## What it starts from

- A parked idea or a draft: `.epic-flow/<slug>/brief.md`.
- A plan file, a pasted list or a findings report. These are input to this stage, never a reason to skip it. Decisions the source records as the user's are `answered`; the rest are `assumed`, with the source as **Source**. Put the source's path under **Where it came up**.
- A list gives one brief per item. Items that are one change share a brief. Say which you joined in the draft.
- A bare idea: park it first (as `$epic-flow-idea` does), then go on.

## How to work

1. Read the input and every record for the feature. Read the repository only where the idea would otherwise contradict what the product already is, and cite what you read. When the idea depends on how a domain or a named reference product works, look it up.
2. Open with a draft: what you think the user is asking for, the constraints you found, and what you are unsure about.
3. Develop the detail with a questioner and an answerer before asking the user anything. Alone, spawn one of each per feature as subagents, or play both roles when the idea fits in a few lines. Two rounds at most.
4. Ask the user only the questions still `open`. Batch them with the host’s user-input tool within its supported question limit, otherwise in chat, recommended option first, each header the feature's slug. Ask a question that has no sensible options in plain text.
5. When the user adds detail or new ideas instead of answering, fold them into the draft, have the answerer look at what changed, and ask only what remains. "Best guess it" or "use your defaults" means: answer the rest by the answer order, use rule 5 where nothing earlier settles it, and mark them `assumed`. Credentials, accounts and steps only a person can do stay `open`.
6. When the problem and the constraints are clear, offer two or three approaches. Lead with the one you recommend. Give each one's trade-off in the open: what it costs, what it gives up, and what would make the user pick another. Wait for their choice.
7. Walk the chosen approach in short pieces: what it does, what it will not do, and how someone can tell it worked. Correct the draft where a piece may not be what the user wants. A new constraint changes the approach before the file is written.
8. Settle **Delivery**. With several features, ask once and offer "same for all".

Everything the user asked for is in scope. Move an item to **Out of scope**, or into a later feature, only when they say so or pick that option in a question. A later feature is parked as its own idea. Name no decider, owner, team, Security or Compliance step that the user did not name themselves.

Under `epic-flow-run`, the run's develop step plays steps 1 to 3 for each feature, and its question session plays steps 4 to 8 for all features at once.

## Questioner

- Owns the feature's files. It is the only role that writes `brief.md` and `questions.md`.
- Reads the input, the records, and the repository where step 1 allows.
- Writes the draft brief (status `draft`) with every section it can fill.
- Asks Socratic questions that draw out the purpose, who it serves, the constraints, the edge cases, what it must not do, how success shows, and how it is delivered. Each question is a decision. A fact it can look up, it looks up.
- Writes each question to `questions.md` as `open`, with **Raised by** `brainstorm`, the stage it **Blocks**, **Why it matters** and a **Default if unanswered**.
- After each answerer round: fills in **Answer** and **Source** and changes the heading's status, folds the answers into the brief, and adds a follow-up only where an answer opens a new decision.
- Returns the ids of the questions the answerer marked `user`.

## Answerer

- Reads only. Writes nothing.
- Starts from a fresh context. It did not write the draft.
- Takes each question through the answer order in the conventions and stops at the first rule that gives an answer. Returns the id, the answer, the rule number and the source: a path with a line, a URL with a quote, or the message the user wrote.
- Marks a question `user` when it belongs to the user (purpose, who it serves, scope, credentials, anything only a person can do), or when no rule settles it. It never guesses at these.
- Says so when the draft contradicts the repository or something the user said, with the source.

## Write the brief

`.epic-flow/<slug>/brief.md`:

```yaml
---
name: <slug>
status: accepted
---
```

- **Idea** and **Where it came up.** Kept from the parked idea, or written from the input.
- **Problem.** Who is blocked, and why this is worth doing.
- **Decisions.** Each choice, why, and its trade-off. One line for each approach the user rejected.
- **Approach.** The chosen design in prose. Conceptual. No file paths, no patches, no task list.
- **Success.** Observable outcomes, each checkable later without asking what was meant. The technical plan turns them into acceptance criteria.
- **Out of scope.** Only what the user put there.
- **Delivery.** Base branch, branch, push, PR, time budget, prerequisites, as in the conventions. **Build shape** only when the user chooses it now from the conventions' options; otherwise the run or build asks.

Use `draft` while any question for this feature is `open` or the user has not chosen an approach. Open questions live in `questions.md`, not in the brief.

Alone, stop when the brief is written. Give its full path. The next stage is technical plan.

## Done when

- [ ] `brief.md` has front matter `name` equal to the folder name and `status: accepted`.
- [ ] It has **Problem**, **Decisions**, **Approach**, **Success**, **Out of scope** (or no out-of-scope items) and **Delivery**.
- [ ] **Approach** names no file path.
- [ ] Each **Success** line is an outcome someone can observe.
- [ ] **Delivery** names the base branch, the branch, push yes or no, the PR target or no PR, and the prerequisites.
- [ ] `questions.md` has no `open` entry, and every other entry has **Answer** and **Source** filled in.
- [ ] Each **Out of scope** item traces to a question the user answered or to their words quoted under **Decisions**.
- [ ] No owner, decider, team or approval step other than the user appears in the brief.
- [ ] `status.md` has a `brainstorm finished` line with a UTC time.
