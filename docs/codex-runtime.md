# Codex controller

Use the persistent Node REPL and Codex's native collaboration tools. The queue
adapter in `scripts/codex-flow.mjs` executes `flow.mjs` with injected agent calls.
It preserves the scheduler; it does not invoke a model or launch agents itself.
Import the queue adapter in the persistent Node REPL; the scheduler is a library, not a command-line program.

## Runtime dependencies

| Capability | Implementation in this package |
| --- | --- |
| Stage scheduling, dependencies, retries and merge order | `scripts/flow.mjs` |
| Persistent queue and result validation | `scripts/codex-flow.mjs`, imported in the Node REPL |
| Starting, waiting for and messaging agents | Codex native agent tools, driven by the controller instructions below |
| Questions for the user | The host’s question tools when available, otherwise chat |
| Model and reasoning selection | Host and user settings; queue jobs contain no model overrides |

The reusable scheduling and dependence-analysis algorithms run locally. Agent
execution still requires a running Codex session. This package does not provide
a separate daemon, model client or autonomous process that survives app shutdown.

## Start and drive a run

Discover the persistent `node_repl` JavaScript tool if it is deferred. In it:

```js
var { startFlow } = await import('/absolute/installed/plugin/scripts/codex-flow.mjs');
var epicFlow = startFlow({
  mode: 'flow', repo: '/absolute/main/checkout',
  pluginRoot: '/absolute/installed/plugin', verifyRounds: 2,
  features: [{ slug: 'example', from: 'technical-plan', to: 'verify', after: [] }]
});
nodeRepl.write(await epicFlow.snapshot());
```

Use `mode: 'develop'` with `features: [{slug, source}]` and `unattended` for
brief development. These are the same arguments described in the run skill.
Use absolute installed paths, never the original author's checkout path.

For each queued job, subject to available agent slots:

1. Call `epicFlow.claim(id)` in the REPL and read its prompt and schema.
2. Spawn a fresh Codex agent with that prompt plus the JSON schema, asking for
   one JSON result. Use `collaboration.spawn_agent` where exposed, or the host's
   native `spawn_agent` equivalent. Use a fresh context (`fork_turns: 'none'`
   where supported). Supply only the job prompt, schema, and applicable user
   constraints; never attach the builder's report to a checker.
3. Keep the job id to agent id mapping in this conversation. Use native waits
   for running agents, process results as they arrive, and communicate progress.
   Do not block the REPL awaiting `completion`: the controller must service jobs.
4. Parse the agent's JSON, then call `epicFlow.complete(id, parsedResult)`.
   Schema errors leave the job running: ask that same agent to correct the JSON.
   An agent that failed or cannot return a usable result gets `epicFlow.fail(id)`.
   Do not invent a successful result. Close/release finished agents when the
   host requires it to free slots.
5. Call `snapshot()` again immediately. Dispatch newly unblocked jobs while
   others are running. Leave excess jobs queued, so host slot limits apply to
   the entire run. Never wait for all features as a batch.
6. Finish only when the snapshot's state is `done` or `error`. Report the returned
   feature outcomes and verify each against its on-disk records. A `done` queue
   means scheduling ended; individual features can still have failed or waited.

Model selection belongs to the host and user. Queue jobs describe the work and
required output schema. They do not set a model or reasoning level.

## Missing tools, interrupted runs, and permissions

If the persistent Node REPL or agent tools are unavailable, disclose the limit.
Follow the same stage order directly, serially; use an independent checker when
available. If none is available, record that the independent check could not run
and stop before treating the stage as checked. Do not fabricate tool names or
claim the concurrent scheduler ran. Offer parallel delivery only when the host
supports it. Sequential delivery still permits separate preparation/test agents.

The queue is in memory. After a REPL reset or chat interruption, inspect actual
agent state and worktrees before restarting; do not create duplicate writers.
Resume from `status.md` using a new queue once the prior writers have stopped.
Stages record their own start/end events; the adapter does not synthesize them.

All file, git, network and shell actions use Codex's normal permissions. A
prerequisite or approval that cannot be resolved leaves the feature waiting.
"Unattended" never grants permission to bypass host controls.
