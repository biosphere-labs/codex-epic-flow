# Reliability validation, 23 November 2026

The automated tests exercise the scheduler with controlled agent responses. They do not prove that a real host wrote a file or resumed after a process exit. The live checks below are reported separately.

## Automated checks

`node --test tests/*.test.mjs` passes. The scheduler harness contains 51 cases, including distinct contract recovery requests, repeated requests, the configurable recovery limit, checker exceptions, and draining outstanding workers before return. All seven real-Git delivery integration cases also pass, including rejection of hidden tracked edits under assume-unchanged and skip-worktree flags in the main repository and initialized submodules at two depths. It checks the exact clean commit and configured push destination with disposable repositories.

The scheduler now allows distinct contract-recovery waves up to a default limit of four per build invocation (`contractRounds` can override it). Repeated identical requests stop early. Rejected host-agent promises follow the missing-agent failure path, allowing outstanding work to drain. An interrupted stage retains its stage identity and requests a persisted stop record.

## PR review scope

The cross-model panel was dispatched against the PR revision before these follow-up changes. Codex used `gpt-6-astra` at high reasoning. Claude and Antigravity could not participate because their accounts reported quota exhaustion. The panel reviewed `af4f6c8c808c8bd08a108ed101e110eab86895fa` and returned **request changes**. Two model families (OpenAI and xAI) counted, satisfying its quorum, with a Codex verifier confirming the blocking findings. These results apply to that pinned revision; they are not approval of later changes.

An independent GPT-6 high-reasoning verifier exercised the follow-up scheduler changes, including varying contract diagnostics and an exception while another group was still running. Its probes stopped at the recovery limit and observed no active work or late merges after return. This is controlled scheduler evidence, not a complete live project build.

The 11 Codex queue tests also pass.

## Live Codex technical-plan restart: passed

Tested PR revision: `af4f6c8c808c8bd08a108ed101e110eab86895fa`. This live test preceded the scheduler follow-up changes. The candidate's run skill and actual persistent scheduler dispatched real, fresh-context `gpt-6-astra` high-reasoning agents in a disposable Git repository. There was no remote delivery.

Fault injection applied only to the initial and repair writers: write exactly one acceptance example per criterion. Checkers received the unmodified stage checklist and read the actual files, without the writer's report or a prescribed verdict. Both checkers rejected the candidate. The actual recorder persisted `stage: technical-plan`, `state: stopped`, with the missing-example diagnosis at `2026-11-23T08:11:44Z`.

The first host process exited. A new process read that disk record with no writer fault instruction, repaired each criterion to two examples, obtained an independent pass, and persisted `technical-plan / done` at `2026-11-23T08:21:20Z`.

| Role | Session |
| --- | --- |
| Rejection controller | `01a2076e-0395-7b41-8b7c-f0a5e5c33f20` |
| Final rejecting checker | `01a20774-8a76-7892-a25c-1c4af61006e2` |
| Stop recorder | `01a20775-6d80-7162-b424-2380d0ce6196` |
| Fresh resume controller | `01a20778-056f-7022-86c8-edd5e8d2c277` |
| Passing resume checker | `01a2077c-eff1-7373-a49d-d97934266974` |
| Done recorder | `01a2077e-3466-7141-982e-de1f356d65ef` |

These results establish the exercised technical-plan persistence/restart path. They do not establish every failure mode, a complete live build, or external PR delivery.

## Additional panel findings addressed

- A checker must return both `pass: true` and an empty problems list to authorize stage completion.
- Pending contract changes stop new merge-retry writers. Other build failures no longer suppress the contract wave; those failures remain blocking after the wave.
- A finalizer's `failed` result is treated as a delivery error, without dispatching product build again. Missing and unsuccessful finalizers request a durable stop record.
- The delivery helper rejects assume-unchanged and skip-worktree index flags before any push. This deliberately also rejects sparse-checkout entries: clear those flags and repeat verification in a fully visible worktree before delivery.

The regression tests exercise each of these conditions. Real Git tests verify that a hidden dirty file cannot reach the configured remote. Controlled scheduler tests verify recorder dispatch; they do not substitute for the live-host evidence above.

## Persistence follow-up

The scheduler now requests and awaits a record of the first rejection before dispatching repair. If that recording fails, repair does not start. A repair-agent failure retains the original checker diagnosis. Every non-completed stage result, including scheduler-generated build validation errors, requests a stopped or waiting record before return. The controlled tests assert these dispatch and acknowledgment boundaries.

The hidden-index check also traverses initialized submodules recursively. Real Git tests cover both index flags in direct and nested submodules, with ordinary dirty edits rejected as a control and no remote ref created on rejection.

An independent targeted recheck confirmed the corrected rejection ordering, stopped records for scheduler-generated errors, and hidden-edit rejection in direct and nested submodules. It reran both suites and its own failure probes. The conclusion is limited to scheduler/helper behavior; native host coverage is described separately above.
