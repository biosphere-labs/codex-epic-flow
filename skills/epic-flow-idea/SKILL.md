---
name: epic-flow-idea
description: >
  Park an idea in Epic Flow in seconds, so you can get back to what
  you were doing. Writes .epic-flow/<slug>/brief.md with status idea, close
  to your own words, and asks nothing. Stage 1 of Epic Flow. Use when the
  user says "park this idea", "PRD idea", "park this", "stick it
  in the folder", "come back to it later", "that's a tangent", or runs
  $epic-flow-idea. Several ideas at once are parked separately.
---

# Epic Flow: Idea

Read `conventions.md` in the plugin root (two levels up from this skill's base directory) before anything else.

The user is in the middle of something else. Save the idea and get out of the way. This stage decides nothing.

## How to work

1. Ask nothing. Do not research, plan or improve the idea.
2. Split what the user said into ideas. Each idea gets its own folder. When it is unclear whether two thoughts are one idea, park them as one and keep both thoughts in it.
3. Pick a kebab-case slug for each from the user's own words. Run `git rev-parse --show-toplevel` in the main checkout to find `<repo>`. List `<repo>/.epic-flow/`. If the slug is taken, add a word that tells them apart. That listing is the only repository reading this stage does.
4. Note where the idea came up: the task in hand, the branch (`git branch --show-current`), and the file or feature being discussed. Take these from the conversation and that one git command.
5. Write the files below. Never overwrite an existing `brief.md`.

## Write the brief

`<repo>/.epic-flow/<slug>/brief.md`:

```yaml
---
name: <slug>
status: idea
---
```

- **Idea.** What the user said, nearly in their words. Fix dictation errors only where the meaning is plain. Keep their examples, names and numbers.
- **Where it came up.** The task, branch and file in hand, one line each.
- **Notes.** Anything else the user said about it: a constraint, a worry, a link, a reference product. Omit when there is none.

`<repo>/.epic-flow/<slug>/status.md`:

```yaml
---
name: <slug>
stage: idea
state: done
---
```

```
<date -u +%FT%TZ> idea finished: parked from <task or branch>
```

## Reply

One line per idea with the full path of its `brief.md`, then one line naming the next step: `$epic-flow-run <slug>` (or the slugs together), which starts with brainstorm. Then go straight back to what the user was doing.

## Done when

- [ ] Every idea the user named has its own `<repo>/.epic-flow/<slug>/` folder.
- [ ] Each `brief.md` has front matter `name` equal to the folder name and `status: idea`.
- [ ] Each `brief.md` has an **Idea** section in the user's words and a **Where it came up** section.
- [ ] No `brief.md` that existed before this stage was changed.
- [ ] Each folder has `status.md` with `stage: idea`, `state: done` and one `idea finished` line with a UTC time.
- [ ] No other file in the repository changed.
