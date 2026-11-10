export async function runFlow(args, agent, parallel, phase, log) {
// Stages the unattended flow can run. Brainstorm runs as `develop` plus the question session in the main conversation.
const STAGES = ['technical-plan', 'decompose', 'gaps', 'build', 'verify']
const DEVELOP_ROUNDS = 2

const A = args || {}
if (!A.repo || !A.pluginRoot || !Array.isArray(A.features) || A.features.length === 0) {
  throw new Error('epic-flow: start this from $epic-flow-run, which passes repo, pluginRoot and features.')
}
const VERIFY_ROUNDS = Number.isInteger(A.verifyRounds) ? A.verifyRounds : 2

const CONVENTIONS = `${A.pluginRoot}/conventions.md`
const skillFile = name => `${A.pluginRoot}/stages/${name}.md`
const records = slug => `${A.repo}/.epic-flow/${slug}`

const runContext = slug => [
  'You are working under epic-flow-run, unattended. Nobody will answer a question during this run.',
  `Repository (main checkout): ${A.repo}`,
  `Feature: ${slug}. Records: ${records(slug)}/`,
  `Read ${CONVENTIONS} first. It defines the records, the status values, the answer order for questions, and what running under epic-flow-run means.`,
].join('\n')

// ---------- develop: questioner and answerer draft each brief ----------

const QUESTION = {
  type: 'object',
  properties: { id: { type: 'string' }, question: { type: 'string' }, why: { type: 'string' } },
  required: ['id', 'question'],
}
const FOR_USER = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    question: { type: 'string' },
    recommended: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'question', 'recommended'],
}
const QUESTIONER = {
  type: 'object',
  properties: {
    brief: { type: 'string', description: 'full path of brief.md' },
    summary: { type: 'string', description: 'two lines: what the draft says the feature is' },
    questions: { type: 'array', items: QUESTION, description: 'questions for the answerer; empty when there are none' },
    forUser: { type: 'array', items: FOR_USER, description: 'questions still open in questions.md' },
    assumed: { type: 'integer', description: 'how many answers in questions.md are assumed' },
    status: { type: 'string', enum: ['draft', 'accepted'] },
  },
  required: ['brief', 'summary', 'questions', 'forUser', 'assumed', 'status'],
}
const ANSWERER = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          rule: { type: 'string', enum: ['1', '2', '3', '4', '5', 'user'] },
          answer: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['id', 'rule'],
      },
    },
  },
  required: ['answers'],
}

const userRule = A.unattended
  ? 'The user asked not to be asked. A question the answerer marked user gets the smaller, reversible option (rule 5), recorded as assumed, unless it is about credentials, accounts or something only a person can do; those stay open.'
  : 'A question the answerer marked user stays open in questions.md, with your recommended answer as its default.'

async function develop(f) {
  const tag = f.slug
  let q = await agent([
    runContext(f.slug),
    `Read ${skillFile('brainstorm')} and act as the Questioner it defines. This is the first round.`,
    `Start from ${f.source || `${records(f.slug)}/brief.md`}.`,
    'Write the draft brief and add every question to questions.md as the Questioner section says.',
    'Return the questions the Answerer should take. forUser and assumed describe questions.md as it stands now.',
  ].join('\n'), { label: `${tag} questioner`, phase: 'Develop', schema: QUESTIONER })
  if (!q) return { slug: f.slug, error: 'questioner did not return' }

  for (let round = 1; round <= DEVELOP_ROUNDS && q.questions.length > 0; round++) {
    const a = await agent([
      runContext(f.slug),
      `Read ${skillFile('brainstorm')} and act as the Answerer it defines. Read only; write nothing.`,
      `The draft brief is ${q.brief}. Answer these questions:`,
      JSON.stringify(q.questions, null, 2),
    ].join('\n'), { label: `${tag} answerer ${round}`, phase: 'Develop', schema: ANSWERER })
    if (!a) return { slug: f.slug, brief: q.brief, error: `answerer ${round} did not return` }

    const last = round === DEVELOP_ROUNDS
    const next = await agent([
      runContext(f.slug),
      `Read ${skillFile('brainstorm')} and act as the Questioner it defines. Round ${round} of ${DEVELOP_ROUNDS}.`,
      'The Answerer returned:',
      JSON.stringify(a.answers, null, 2),
      'Fold the answers into brief.md and questions.md.',
      last ? 'This is the last round: ask no follow-ups.' : 'Ask follow-ups only where an answer opens a new decision.',
      userRule,
      'Set brief.md to accepted only when no question for this feature is open; otherwise leave it draft.',
      'For each open question, give your recommended answer and up to three other options.',
    ].join('\n'), { label: `${tag} questioner ${round}`, phase: 'Develop', schema: QUESTIONER })
    if (!next) return { slug: f.slug, brief: q.brief, error: `questioner round ${round} did not return` }
    q = next
  }
  return { slug: f.slug, brief: q.brief, summary: q.summary, status: q.status, forUser: q.forUser, assumed: q.assumed }
}

// ---------- flow: each stage, then an independent check from the files ----------

const STAGE_RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['done', 'waiting', 'blocked', 'failed', 'error'] },
    summary: { type: 'string', description: 'what the files now show, in a few lines' },
    questions: { type: 'array', items: { type: 'string' }, description: 'ids of questions this stage left open' },
  },
  required: ['outcome', 'summary'],
}
const CHECK = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string' }, description: 'each Done when item that does not hold, with the evidence' },
  },
  required: ['pass', 'problems'],
}

const stagePrompt = (f, stage, note) => [
  runContext(f.slug),
  `Run the Epic Flow stage "${stage}" for this feature: read ${skillFile(stage)} and follow it.`,
  note || '',
  'When the stage ends, return its outcome as the conventions define it (done, waiting, blocked, failed, error), a short summary of what the files now show, and the ids of any questions it left open.',
].filter(Boolean).join('\n')

const codeStages = new Set(['decompose', 'build', 'verify'])
const checkPrompt = (f, stage) => [
  'You are the independent checker for one Epic Flow stage. Trust no summary, including the stage agent\'s. Test from the files only.',
  `Repository (main checkout): ${A.repo}. Feature records: ${records(f.slug)}/`,
  `Read ${CONVENTIONS}, then the "Done when" list at the end of ${skillFile(stage)}.`,
  codeStages.has(stage)
    ? `Test every item against the records, the worktree at ${A.repo}/.worktrees/${f.slug}/ and its git log. Re-run the commands the records cite as evidence; a recorded result you cannot reproduce fails its item.`
    : 'Test every item against the records and the repository.',
  'Change nothing: no edits, no commits, and revert anything a command leaves behind.',
  'Return pass true only when every item holds. List each item that does not, with the evidence.',
].join('\n')

// ---------- build, orchestrated by events ----------
// The build stage runs as code: a plan agent returns the shape, the task order or groups; then each
// piece starts the moment what it needs is ready. Sequential keeps one writer, and removes waiting
// around it: the next task's brief is prepared while the current one builds, each task's tests run in
// the background as soon as it is committed, and the acceptance tests are written alongside the build.
// Parallel starts each group the moment the groups it depends on have merged, and merges finished
// groups in the order they finish.

const BUILD_PLAN = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['ready', 'waiting', 'error'] },
    summary: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
    shape: { type: 'string', enum: ['sequential', 'parallel'] },
    tasks: {
      type: 'array',
      description: 'sequential: the open tasks in build order, each with the task ids it depends on',
      items: { type: 'object', properties: { id: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } } }, required: ['id'] },
    },
    groups: {
      type: 'array',
      description: 'parallel: each group, its task ids, and the groups that must merge before it starts',
      items: { type: 'object', properties: { name: { type: 'string' }, tasks: { type: 'array', items: { type: 'string' } }, after: { type: 'array', items: { type: 'string' } } }, required: ['name', 'tasks'] },
    },
  },
  required: ['outcome', 'summary'],
}
const PIECE = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['closed', 'open', 'blocked', 'budget'] },
    summary: { type: 'string' },
  },
  required: ['outcome', 'summary'],
}
const TESTED = {
  type: 'object',
  properties: { pass: { type: 'boolean' }, summary: { type: 'string' } },
  required: ['pass', 'summary'],
}
const MERGED = {
  type: 'object',
  properties: { merged: { type: 'boolean' }, diagnostic: { type: 'string' } },
  required: ['merged'],
}

const buildContext = (f, part) => [
  runContext(f.slug),
  `You are one part of the Epic Flow build for this feature, driven by the run's workflow. Read ${skillFile('build')} for the rules; do only your part: ${part}`,
].join('\n')

async function buildStage(f, note) {
  const tag = `${f.slug} build`
  const plan = await agent([
    buildContext(f, 'the plan.'),
    'Do "Before you start", "Choose the shape" and "Groups". Write `build started`, the `build shape:` line and notes/build-groups.md. Build nothing.',
    note || '',
    'Return outcome ready with the shape and either the open tasks in build order (sequential) or the groups (parallel); waiting with the question ids; or error.',
  ].filter(Boolean).join('\n'), { label: `${tag} plan`, phase: 'Flow', schema: BUILD_PLAN })
  if (!plan) return { outcome: 'error', summary: 'the build plan agent did not return' }
  if (plan.outcome !== 'ready') return { outcome: plan.outcome === 'waiting' ? 'waiting' : 'error', summary: plan.summary, questions: plan.questions || [] }

  const collection = plan.shape === 'sequential' ? plan.tasks : plan.shape === 'parallel' ? plan.groups : null
  if (!Array.isArray(collection)) return { outcome: 'error', summary: 'ready build plan requires a valid shape and its task or group array' }
  const ids = collection.map(item => plan.shape === 'sequential' ? item.id : item.name)
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    return { outcome: 'error', summary: 'build plan identifiers must be nonempty and unique' }
  }
  if (plan.shape === 'sequential' && collection.some((task, i) =>
    (task.dependsOn || []).some(id => ids.includes(id) && ids.indexOf(id) >= i))) {
    return { outcome: 'error', summary: 'sequential build plan is not in dependency order' }
  }
  if (plan.shape === 'parallel') {
    const tasks = collection.flatMap(group => group.tasks || [])
    if (new Set(tasks).size !== tasks.length) return { outcome: 'error', summary: 'a task belongs to more than one build group' }
  }

  // Acceptance tests are written alongside the build, on their own branch; verify merges them.
  const acceptance = agent(buildContext(f, 'the acceptance tests.'
    + ' Follow "Acceptance tests during the build". Touch no product code and nothing outside your own worktree.'),
    { label: `${tag} acceptance tests`, phase: 'Flow', schema: TESTED })

  const problems = plan.shape === 'parallel' ? await buildParallel(f, plan.groups || []) : await buildSequential(f, plan.tasks || [])
  const acceptanceResult = await acceptance
  if (!acceptanceResult || acceptanceResult.pass !== true) {
    problems.push(`acceptance tests failed: ${acceptanceResult ? acceptanceResult.summary : 'the acceptance agent did not return'}`)
  }

  const finish = await agent([
    buildContext(f, 'the finish.'),
    'Every builder and test run has returned. Do "After the last task" (sequential) or the end of "Merge train" (parallel), then "Task status" and "When the build ends". Write `build finished`.',
    problems.length ? `Events during the build:\n- ${problems.join('\n- ')}` : '',
    'Return the stage outcome as the conventions define it.',
  ].filter(Boolean).join('\n'), { label: `${tag} finish`, phase: 'Flow', schema: STAGE_RESULT })
  if (finish && finish.outcome === 'done' && problems.length) return { outcome: 'error', summary: problems.join('\n') }
  return finish || { outcome: 'error', summary: 'the build finish agent did not return' }
}

async function buildSequential(f, tasks) {
  const tag = `${f.slug} build`
  const problems = []
  const failed = new Set()
  const tests = []
  const tested = new Map()
  let budgetSpent = false
  const prepare = t => agent(buildContext(f, `prepare the brief for task ${t.id}.`
    + ' Follow "Prepare ahead". Read only; write only that brief file.'),
    { label: `${tag} prepare ${t.id}`, phase: 'Flow', schema: TESTED })
  const blockedBy = t => (t.dependsOn || []).filter(d => failed.has(d))

  let next = tasks.length ? prepare(tasks[0]) : null
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    await next
    next = i + 1 < tasks.length ? prepare(tasks[i + 1]) : null // starts now, while task i builds
    // A producer's landing tests are part of its output gate. Independent
    // tasks can proceed while those tests run; dependents must wait.
    await Promise.all((t.dependsOn || []).map(id => tested.get(id)))
    const stop = blockedBy(t)
    if (budgetSpent || stop.length) {
      failed.add(t.id)
      problems.push(budgetSpent ? `task ${t.id} not started: budget spent` : `task ${t.id} skipped: it depends on ${stop.join(', ')}, which failed`)
      continue
    }
    const r = await agent(buildContext(f, `build task ${t.id}, and only that task.`
      + ' Follow "Sequential" for one task: use its prepared brief when there is one, write it, run its check and falsification probe, commit. Return closed, open (check failed), blocked (needs a seam changed), or budget (the time budget is spent; change nothing).'),
      { label: `${tag} task ${t.id}`, phase: 'Flow', schema: PIECE })
    if (!r || r.outcome !== 'closed') {
      if (r && r.outcome === 'budget') budgetSpent = true
      failed.add(t.id)
      problems.push(`task ${t.id} ${r ? r.outcome : 'agent did not return'}: ${r ? r.summary : ''}`)
      continue
    }
    // Event: task committed. Its tests run in the background; a failure stops what depends on it.
    const testing = agent(buildContext(f, `test task ${t.id} as it landed.`
      + ' Follow "Test as each task lands": in a scratch worktree at the current feature branch tip, run the tests for the code task ' + t.id + ' changed. On a failure, set that task open with the diagnostic under **Check**. Change no code.'),
      { label: `${tag} test ${t.id}`, phase: 'Flow', schema: TESTED })
      .then(x => { if (!x || !x.pass) { failed.add(t.id); problems.push(`task ${t.id} failed its tests after landing: ${x ? x.summary : 'the test agent did not return'}`) } })
    tests.push(testing)
    tested.set(t.id, testing)
  }
  await Promise.all(tests)
  return problems
}

async function buildParallel(f, groups) {
  const tag = `${f.slug} build`
  const problems = []
  const merged = new Set()
  const stopped = new Set()
  const names = new Set(groups.map(g => g.name))
  const pending = groups.slice()
  const running = new Map()
  let train = Promise.resolve()

  const runGroup = (g, diagnostic) => agent(buildContext(f, `build group ${g.name} (tasks ${g.tasks.join(', ')}).`
    + ' Follow "Infill" for this group only, in its own worktree. Return closed when its tasks pass their checks there, open when one fails, blocked when it needs a contract change (say which declaration).'
    + (diagnostic ? `\nThe merge train sent it back with this diagnostic:\n${diagnostic}` : '')),
    { label: `${tag} group ${g.name}${diagnostic ? ' retry' : ''}`, phase: 'Flow', schema: PIECE })
  const merge = g => agent(buildContext(f, `merge group ${g.name}.`
    + ' Follow "Merge train" for this group: test it on top of the feature branch tip, and merge it when every train check passes. Return merged false with the exact diagnostic otherwise.'),
    { label: `${tag} merge ${g.name}`, phase: 'Flow', schema: MERGED })

  // One group's life: build, then join the train (merges happen one at a time, in finishing order).
  const life = async g => {
    let r = await runGroup(g)
    if (r && r.outcome === 'blocked') {
      const wave = await agent(buildContext(f, `run a small contract wave for group ${g.name}: ${r.summary}`), { label: `${tag} contract wave ${g.name}`, phase: 'Flow', schema: PIECE })
      if (!wave || wave.outcome !== 'closed') return { ok: false, why: `contract wave for group ${g.name} did not close: ${wave ? wave.summary : 'agent did not return'}` }
      r = await runGroup(g, `The contract wave returned closed: ${wave.summary}. Verify the updated contract commit is on the feature branch before changing code.`)
    }
    if (!r || r.outcome !== 'closed') return { ok: false, why: `group ${g.name} ${r ? r.outcome : 'agent did not return'}: ${r ? r.summary : ''}` }
    for (let attempt = 0; attempt < 2; attempt++) {
      const turn = train.then(() => merge(g))
      train = turn.catch(() => null)
      const m = await turn
      if (m && m.merged) return { ok: true }
      if (attempt === 0) {
        const again = await runGroup(g, m ? m.diagnostic : 'the merge agent did not return')
        if (!again || again.outcome !== 'closed') return { ok: false, why: `group ${g.name} could not be fixed after the train sent it back` }
      } else return { ok: false, why: `group ${g.name} failed the train twice: ${m ? m.diagnostic : ''}` }
    }
  }

  while (pending.length || running.size) {
    for (const g of pending.slice()) {
      const after = g.after || []
      const unknown = after.filter(n => !names.has(n) || n === g.name)
      const dead = after.filter(n => stopped.has(n))
      if (unknown.length || dead.length) {
        stopped.add(g.name)
        problems.push(unknown.length ? `group ${g.name} names unknown groups ${unknown.join(', ')}` : `group ${g.name} not started: ${dead.join(', ')} did not merge`)
      } else if (after.every(n => merged.has(n))) {
        running.set(g.name, life(g).then(res => ({ name: g.name, res })))
      } else continue
      pending.splice(pending.indexOf(g), 1)
    }
    if (!running.size) {
      for (const g of pending) { stopped.add(g.name); problems.push(`group ${g.name} not started: its after list forms a cycle`) }
      break
    }
    // Event: a group finished its life (merged or stopped). Start whatever that unblocks.
    const { name, res } = await Promise.race(running.values())
    running.delete(name)
    if (res && res.ok) merged.add(name)
    else { stopped.add(name); problems.push(res ? res.why : `group ${name} failed`) }
  }
  return problems
}

async function runStage(f, stage, note) {
  const tag = `${f.slug} ${stage}`
  let r = stage === 'build'
    ? await buildStage(f, note)
    : await agent(stagePrompt(f, stage, note), { label: tag, phase: 'Flow', schema: STAGE_RESULT })
  if (!r) return { outcome: 'error', summary: 'the stage agent did not return' }
  if (r.outcome !== 'done') return r

  let c = await agent(checkPrompt(f, stage), { label: `${tag} check`, phase: 'Flow', schema: CHECK })
  if (c && c.pass) return r

  const problems = c ? c.problems.join('\n- ') : 'the checker did not return'
  r = await agent(stagePrompt(f, stage, `An independent checker found that these Done when items do not hold. Fix them, then return:\n- ${problems}`),
    { label: `${tag} repair`, phase: 'Flow', schema: STAGE_RESULT })
  if (!r) return { outcome: 'error', summary: 'the repair agent did not return' }
  if (r.outcome !== 'done') return r

  c = await agent(checkPrompt(f, stage), { label: `${tag} recheck`, phase: 'Flow', schema: CHECK })
  if (c && c.pass) return r
  return { outcome: 'error', summary: `the checker still fails it after one repair:\n- ${c ? c.problems.join('\n- ') : 'the checker did not return'}` }
}

async function flow(f) {
  const from = STAGES.indexOf(f.from)
  const to = STAGES.indexOf(f.to)
  if (from < 0 || to < 0 || from > to) {
    return { slug: f.slug, outcome: 'error', stoppedAt: f.from, summary: `range ${f.from} to ${f.to} is not a range of ${STAGES.join(', ')}`, trail: [] }
  }
  const trail = []
  let i = from
  let buildRounds = 0
  let note = f.note || ''
  while (i <= to) {
    const stage = STAGES[i]
    const r = await runStage(f, stage, note)
    trail.push({ stage, outcome: r.outcome, summary: r.summary })
    note = ''
    if (r.outcome === 'done') { i++; continue }
    if (stage === 'verify' && r.outcome === 'failed' && buildRounds < VERIFY_ROUNDS) {
      buildRounds++
      log(`${f.slug}: verify failed; build again (${buildRounds} of ${VERIFY_ROUNDS})`)
      note = `Verify failed and reopened tasks. Build the reopened and new tasks only. Verify reported:\n${r.summary}`
      i = STAGES.indexOf('build')
      continue
    }
    return { slug: f.slug, outcome: r.outcome, stoppedAt: stage, summary: r.summary, questions: r.questions || [], trail }
  }
  return { slug: f.slug, outcome: 'done', stoppedAt: STAGES[to], trail }
}

// ---------- entry ----------

if (A.mode === 'develop') {
  phase('Develop')
  const results = await parallel(A.features.map(f => () => develop(f)))
  return { mode: 'develop', results: results.map((r, i) => r || { slug: A.features[i].slug, error: 'develop failed' }) }
}

phase('Flow')
// Event-driven: a feature with `after: [slugs]` starts the moment those features are done, not when a
// whole round of features has finished. Features without `after` start at once.
// Unknown or circular `after` is an error, never a guess.
const slugs = new Set(A.features.map(f => f.slug))
const outcome = Object.create(null)
const pending = A.features.slice()
const running = new Map()
while (pending.length || running.size) {
  for (const f of pending.slice()) {
    const after = f.after || []
    const missing = after.filter(s => !slugs.has(s) || s === f.slug)
    const stopped = after.filter(s => outcome[s] && outcome[s].outcome !== 'done')
    if (missing.length) outcome[f.slug] = { slug: f.slug, outcome: 'error', stoppedAt: f.from, summary: `after names ${missing.join(', ')}, which is not another feature in this run`, trail: [] }
    else if (stopped.length) outcome[f.slug] = { slug: f.slug, outcome: 'blocked', stoppedAt: f.from, summary: `waits for ${stopped.join(', ')}, which did not finish`, trail: [] }
    else if (after.every(s => outcome[s])) {
      running.set(f.slug, flow(f).catch(() => null).then(r => ({ slug: f.slug, r })))
    } else continue
    pending.splice(pending.indexOf(f), 1)
  }
  if (!running.size) {
    for (const f of pending) outcome[f.slug] = { slug: f.slug, outcome: 'error', stoppedAt: f.from, summary: 'after forms a cycle', trail: [] }
    break
  }
  // Event: a feature finished. Record it, then start whatever it unblocks.
  const { slug, r } = await Promise.race(running.values())
  running.delete(slug)
  outcome[slug] = r || { slug, outcome: 'error', summary: 'the feature chain failed' }
}
return { mode: 'flow', results: A.features.map(f => outcome[f.slug]) }

}
