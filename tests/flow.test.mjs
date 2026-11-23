// Runs epic-flow/scripts/flow.mjs with fake agent()/parallel()/phase()/log() to test its control flow.
// Usage: node tests/flow.test.mjs [path to flow.mjs]  (default: scripts/flow.mjs beside this folder)
import assert from 'node:assert/strict'

const { runFlow } = await import(process.argv[2] || new URL('../scripts/flow.mjs', import.meta.url));
const body = runFlow;

// script: (label, prompt, callIndexForLabelPrefix) => result
async function run(args, script, recorder = () => ({ outcome: 'done', summary: 'state recorded' })) {
  const calls = []
  const seen = {}
  const agent = async (prompt, opts) => {
    calls.push(opts.label)
    seen[opts.label] = (seen[opts.label] || 0) + 1
    if (opts.label.endsWith(' record')) return recorder(opts.label, prompt)
    const r = await script(opts.label, prompt, seen[opts.label], opts)
    // Tests written before the build was orchestrated answer the build plan with "done": treat that as a plan with no tasks.
    if (opts.label.endsWith(' build plan') && r && r.outcome === 'done') return { outcome: 'ready', summary: 's', shape: 'sequential', tasks: [] }
    if (opts.label.endsWith(' acceptance tests') && r && r.outcome === 'done') return { pass: true, summary: 'acceptance fixtures' }
    return r
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const out = await body(args, agent, parallel, () => {}, () => {})
  return { out, calls }
}

const base = { repo: '/r', pluginRoot: '/p' }
const done = { outcome: 'done', summary: 's' }
const pass = { pass: true, problems: [], commit: 'a'.repeat(40) }
const results = []
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]) } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]) }
}

await test('happy path runs five stages, each checked once', async () => {
  const { out, calls } = await run({ ...base, features: [{ slug: 'a', from: 'technical-plan', to: 'verify' }] },
    label => (label.endsWith('check') ? pass : done))
  const r = out.results[0]
  assert.equal(r.outcome, 'done'); assert.equal(r.stoppedAt, 'verify')
  assert.deepEqual(r.trail.map(t => t.stage), ['technical-plan', 'decompose', 'gaps', 'build', 'verify'])
  assert.equal(calls.length, 17) // build is plan, acceptance tests and finish, plus its check
})

await test('verify failing once sends the feature back to build, then passes', async () => {
  const { out, calls } = await run({ ...base, features: [{ slug: 'b', from: 'build', to: 'verify' }] },
    (label, prompt, n) => {
      if (label.endsWith('check')) return pass
      if (label === 'b verify' && n === 1) return { outcome: 'failed', summary: 'AC-2 not tested' }
      return done
    })
  const r = out.results[0]
  assert.equal(r.outcome, 'done')
  assert.deepEqual(r.trail.map(t => t.stage), ['build', 'verify', 'build', 'verify'])
  const secondBuild = calls.filter(l => l === 'b build plan').length
  assert.equal(secondBuild, 2)
})

await test('the rebuild prompt carries what verify reported', async () => {
  let rebuildPrompt = ''
  await run({ ...base, features: [{ slug: 'b', from: 'build', to: 'verify' }] },
    (label, prompt, n) => {
      if (label.endsWith('check')) return pass
      if (label === 'b build plan' && n === 2) rebuildPrompt = prompt
      if (label === 'b verify' && n === 1) return { outcome: 'failed', summary: 'AC-2 not tested' }
      return done
    })
  assert.match(rebuildPrompt, /AC-2 not tested/)
  assert.match(rebuildPrompt, /reopened and new tasks only/)
})

await test('verify failing every time stops after verifyRounds rebuilds', async () => {
  const { out, calls } = await run({ ...base, verifyRounds: 2, features: [{ slug: 'c', from: 'build', to: 'verify' }] },
    label => (label.endsWith('check') ? pass : label === 'c verify' ? { outcome: 'failed', summary: 'x' } : done))
  const r = out.results[0]
  assert.equal(r.outcome, 'failed'); assert.equal(r.stoppedAt, 'verify')
  assert.equal(calls.filter(l => l === 'c build plan').length, 3)
  assert.equal(calls.filter(l => l === 'c verify').length, 3)
})

await test('gaps blocked stops the feature before build; another feature carries on', async () => {
  const { out, calls } = await run({ ...base, features: [
    { slug: 'd', from: 'technical-plan', to: 'verify' },
    { slug: 'e', from: 'technical-plan', to: 'verify' },
  ] }, label => {
    if (label.endsWith('check')) return pass
    if (label === 'd gaps') return { outcome: 'blocked', summary: 'Q-2 open', questions: ['Q-2'] }
    return done
  })
  const [d, e] = out.results
  assert.equal(d.outcome, 'blocked'); assert.equal(d.stoppedAt, 'gaps'); assert.deepEqual(d.questions, ['Q-2'])
  assert.ok(!calls.includes('d build plan'))
  assert.equal(e.outcome, 'done')
})

await test('a blocked or waiting stage is not sent to the checker', async () => {
  const { calls } = await run({ ...base, features: [{ slug: 'w', from: 'technical-plan', to: 'verify' }] },
    label => (label === 'w technical-plan' ? { outcome: 'waiting', summary: 'Q-1' } : label.endsWith('check') ? pass : done))
  assert.deepEqual(calls, ['w technical-plan', 'w technical-plan record'])
})

await test('a failed check gets one repair and a recheck', async () => {
  const { out, calls } = await run({ ...base, features: [{ slug: 'f', from: 'decompose', to: 'decompose' }] },
    (label, prompt, n) => (label === 'f decompose check' ? { pass: false, problems: ['no contract:'] } : label.endsWith('recheck') ? pass : done))
  assert.equal(out.results[0].outcome, 'done')
  assert.deepEqual(calls, ['f decompose', 'f decompose check', 'f decompose record', 'f decompose repair', 'f decompose recheck', 'f decompose record'])
})

await test('the repair prompt carries the checker problems', async () => {
  let repairPrompt = ''
  await run({ ...base, features: [{ slug: 'f', from: 'decompose', to: 'decompose' }] },
    (label, prompt) => {
      if (label === 'f decompose repair') repairPrompt = prompt
      return label === 'f decompose check' ? { pass: false, problems: ['no contract: field'] } : label.endsWith('recheck') ? pass : done
    })
  assert.match(repairPrompt, /no contract: field/)
})

await test('a check that fails twice ends the feature with error', async () => {
  const { out, calls } = await run({ ...base, features: [{ slug: 'g', from: 'gaps', to: 'build' }] },
    label => (label.includes('check') ? { pass: false, problems: ['p'] } : done))
  assert.equal(out.results[0].outcome, 'error'); assert.equal(out.results[0].stoppedAt, 'gaps')
  assert.ok(!calls.includes('g build plan'))
})

await test('a dead stage agent is an error, not a pass', async () => {
  const { out } = await run({ ...base, features: [{ slug: 'h', from: 'gaps', to: 'build' }] },
    label => (label === 'h gaps' ? null : label.endsWith('check') ? pass : done))
  assert.equal(out.results[0].outcome, 'error'); assert.equal(out.results[0].stoppedAt, 'gaps')
})

await test('a range runs only its own stages', async () => {
  const { out } = await run({ ...base, features: [{ slug: 'i', from: 'technical-plan', to: 'decompose' }] },
    label => (label.endsWith('check') ? pass : done))
  assert.deepEqual(out.results[0].trail.map(t => t.stage), ['technical-plan', 'decompose'])
})

await test('a range that is not a range is an error without agents', async () => {
  const { out, calls } = await run({ ...base, features: [{ slug: 'j', from: 'verify', to: 'gaps' }] }, () => done)
  assert.equal(out.results[0].outcome, 'error'); assert.ok(calls.every(label => label.endsWith(' record')))
})

await test('missing args throw', async () => {
  await assert.rejects(() => run({ features: [] }, () => done), /start this from \$epic-flow-run/)
})

await test('stage prompts point at the stage skill and the conventions', async () => {
  let p = ''
  await run({ ...base, features: [{ slug: 'k', from: 'gaps', to: 'gaps' }] },
    (label, prompt) => { if (label === 'k gaps') p = prompt; return label.endsWith('check') ? pass : done })
  assert.match(p, /\/p\/stages\/gaps\.md/)
  assert.match(p, /\/p\/conventions\.md/)
  assert.match(p, /\/r\/\.epic-flow\/k\//)
})

await test('develop: questioner, answerer, questioner, answerer, questioner, then stops', async () => {
  const q = (n, questions) => ({ brief: '/r/.epic-flow/m/brief.md', summary: 's', questions, forUser: n === 3 ? [{ id: 'Q-4', question: 'who?', recommended: 'x' }] : [], assumed: n, status: 'draft' })
  const { out, calls } = await run({ ...base, mode: 'develop', features: [{ slug: 'm' }] },
    label => {
      if (label === 'm questioner') return q(1, [{ id: 'Q-1', question: 'a' }])
      if (label === 'm questioner 1') return q(2, [{ id: 'Q-3', question: 'b' }])
      if (label === 'm questioner 2') return q(3, [{ id: 'Q-5', question: 'c' }])
      return { answers: [{ id: 'Q-1', rule: '2' }] }
    })
  assert.deepEqual(calls, ['m questioner', 'm answerer 1', 'm questioner 1', 'm answerer 2', 'm questioner 2'])
  assert.equal(out.results[0].forUser[0].id, 'Q-4')
  assert.equal(out.results[0].assumed, 3)
})

await test('develop: no questions after the first draft means no answerer', async () => {
  const { calls } = await run({ ...base, mode: 'develop', features: [{ slug: 'n' }] },
    () => ({ brief: 'b', summary: 's', questions: [], forUser: [], assumed: 0, status: 'accepted' }))
  assert.deepEqual(calls, ['n questioner'])
})

await test('develop: the last questioner round is told to ask no follow-ups', async () => {
  let last = ''
  await run({ ...base, mode: 'develop', features: [{ slug: 'o' }] },
    (label, prompt) => {
      if (label === 'o questioner 2') last = prompt
      if (label.includes('answerer')) return { answers: [] }
      return { brief: 'b', summary: 's', questions: [{ id: 'Q', question: 'q' }], forUser: [], assumed: 0, status: 'draft' }
    })
  assert.match(last, /last round: ask no follow-ups/)
})

await test('develop: unattended changes how user questions are settled', async () => {
  const prompts = []
  const s = (label, prompt) => {
    prompts.push(prompt)
    if (label.includes('answerer')) return { answers: [] }
    return { brief: 'b', summary: 's', questions: label === 'p questioner' ? [{ id: 'Q', question: 'q' }] : [], forUser: [], assumed: 0, status: 'draft' }
  }
  await run({ ...base, mode: 'develop', unattended: true, features: [{ slug: 'p' }] }, s)
  assert.ok(prompts.some(p => /The user asked not to be asked/.test(p)))
})

await test('a feature that comes after another is not started with it; independent features still run together', async () => {
  const order = []
  const s = async (label) => {
    if (label.endsWith('check')) return pass
    order.push(label)
    await new Promise(r => setTimeout(r, label.startsWith('a ') ? 20 : 0))
    order.push(label + ' end')
    return done
  }
  const feats = [
    { slug: 'a', from: 'build', to: 'build' },
    { slug: 'b', from: 'build', to: 'build', after: ['a'] },
    { slug: 'c', from: 'build', to: 'build' },
  ]
  const { out } = await run({ ...base, features: feats }, s)
  assert.ok(order.indexOf('c build plan') < order.indexOf('a build finish end'), 'independent a and c run together')
  assert.ok(order.indexOf('b build plan') > order.indexOf('a build finish end'), 'b waits for a')
  assert.deepEqual(out.results.map(r => r.outcome), ['done', 'done', 'done'])
})

await test('a feature whose predecessor stopped is not started', async () => {
  const { out, calls } = await run({ ...base, features: [
    { slug: 'a', from: 'build', to: 'build' }, { slug: 'b', from: 'build', to: 'build', after: ['a'] }] },
    label => (label.endsWith('check') ? pass : label === 'a build finish' ? { outcome: 'failed', summary: 'x' } : done))
  assert.ok(!calls.includes('b build plan'))
  assert.equal(out.results[1].outcome, 'blocked')
})

await test('an unknown or circular after is an error, not a guess', async () => {
  const { out, calls } = await run({ ...base, features: [
    { slug: 'a', from: 'build', to: 'build', after: ['b'] }, { slug: 'b', from: 'build', to: 'build', after: ['a'] },
    { slug: 'c', from: 'build', to: 'build', after: ['zzz'] }] }, label => (label.endsWith('check') ? pass : done))
  assert.ok(calls.every(label => label.endsWith(' record')))
  assert.deepEqual(out.results.map(r => r.outcome), ['error', 'error', 'error'])
})


// ---------- events ----------

const sleep = ms => new Promise(r => setTimeout(r, ms))
const ready = (extra) => ({ outcome: 'ready', summary: 's', ...extra })
const closed = { outcome: 'closed', summary: 's', commit: 'b'.repeat(40) }
const ok = { pass: true, summary: 's' }

await test('a feature starts the moment the one it needs finishes, not when a slow unrelated one does', async () => {
  const order = []
  const s = async label => {
    if (label.endsWith('check')) return pass
    order.push(label)
    if (label.startsWith('c ')) await sleep(40)
    order.push(label + ' end')
    return done
  }
  await run({ ...base, features: [
    { slug: 'a', from: 'gaps', to: 'gaps' },
    { slug: 'b', from: 'gaps', to: 'gaps', after: ['a'] },
    { slug: 'c', from: 'gaps', to: 'gaps' },
  ] }, s)
  assert.ok(order.indexOf('b gaps') < order.indexOf('c gaps end'), 'b started before slow c finished')
})

await test('sequential: the next brief is prepared while the current task builds', async () => {
  const order = []
  const s = async label => {
    order.push(label)
    if (label.endsWith('build plan')) return ready({ shape: 'sequential', tasks: [{ id: '1' }, { id: '2' }, { id: '3' }] })
    if (label.includes(' task ')) { await sleep(10); order.push(label + ' end'); return closed }
    if (label.includes(' prepare ') || label.includes(' test ') || label.endsWith('acceptance tests')) return ok
    return label.endsWith('check') ? pass : done
  }
  await run({ ...base, features: [{ slug: 's', from: 'build', to: 'build' }] }, s)
  assert.ok(order.indexOf('s build prepare 2') < order.indexOf('s build task 1 end'), 'brief 2 prepared during task 1')
  assert.ok(order.indexOf('s build prepare 3') < order.indexOf('s build task 2 end'), 'brief 3 prepared during task 2')
  assert.ok(order.indexOf('s build test 1') < order.indexOf('s build task 2 end'), 'task 1 tested while task 2 builds')
  assert.ok(order.indexOf('s build acceptance tests') < order.indexOf('s build task 1 end'), 'acceptance tests written alongside the build')
  assert.equal(order.filter(l => /task \d$/.test(l)).length, 3)
})

await test('sequential: a task whose tests fail after landing stops the tasks that depend on it', async () => {
  let finishPrompt = ''
  const s = async (label, prompt) => {
    if (label.endsWith('build plan')) return ready({ shape: 'sequential', tasks: [{ id: '1' }, { id: '2' }, { id: '3', dependsOn: ['1'] }] })
    if (label === 't build test 1') return { pass: false, summary: 'AC-1 example 2 fails' }
    if (label === 't build task 2') { await sleep(20); return closed }
    if (label.includes(' task ')) return closed
    if (label === 't build finish') { finishPrompt = prompt; return done }
    return label.endsWith('check') ? pass : ok
  }
  const { calls } = await run({ ...base, features: [{ slug: 't', from: 'build', to: 'build' }] }, s)
  assert.ok(!calls.includes('t build task 3'), 'task 3 depends on 1 and is never started')
  assert.match(finishPrompt, /task 1 failed its tests after landing/)
  assert.match(finishPrompt, /task 3 skipped/)
})

await test('sequential: an open task skips its dependents but not independent tasks', async () => {
  const s = label => {
    if (label.endsWith('build plan')) return ready({ shape: 'sequential', tasks: [{ id: '1' }, { id: '2', dependsOn: ['1'] }, { id: '3' }] })
    if (label === 'u build task 1') return { outcome: 'open', summary: 'check failed' }
    if (label.includes(' task ')) return closed
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  }
  const { calls } = await run({ ...base, features: [{ slug: 'u', from: 'build', to: 'build' }] }, s)
  assert.ok(!calls.includes('u build task 2'))
  assert.ok(calls.includes('u build task 3'))
})

await test('sequential: a spent time budget starts no more tasks', async () => {
  const s = label => {
    if (label.endsWith('build plan')) return ready({ shape: 'sequential', tasks: [{ id: '1' }, { id: '2' }, { id: '3' }] })
    if (label === 'v build task 2') return { outcome: 'budget', summary: 'spent' }
    if (label.includes(' task ')) return closed
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  }
  const { calls } = await run({ ...base, features: [{ slug: 'v', from: 'build', to: 'build' }] }, s)
  assert.ok(!calls.includes('v build task 3'))
})

await test('parallel: a group starts when what it needs has merged; independent groups start at once', async () => {
  const order = []
  const s = async label => {
    order.push(label)
    if (label.endsWith('build plan')) return ready({ shape: 'parallel', concurrency: 3, groups: [
      { name: 'a', tasks: ['1'] }, { name: 'b', tasks: ['2'], after: ['a'] }, { name: 'c', tasks: ['3'] }] })
    if (label === 'p build group c') { await sleep(40); order.push(label + ' end'); return closed }
    if (label.includes(' group ')) return closed
    if (label.includes(' merge ')) { order.push(label + ' end'); return { merged: true } }
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  }
  await run({ ...base, features: [{ slug: 'p', from: 'build', to: 'build' }] }, s)
  assert.ok(order.indexOf('p build group c') < order.indexOf('p build merge a end'), 'a and c start together')
  assert.ok(order.indexOf('p build group b') > order.indexOf('p build merge a end'), 'b waits for a to merge')
  assert.ok(order.indexOf('p build group b') < order.indexOf('p build group c end'), 'b does not wait for c')
})

await test('parallel: the train sends a failing group back once with its diagnostic, then stops what needs it', async () => {
  let retryPrompt = ''
  const s = (label, prompt) => {
    if (label.endsWith('build plan')) return ready({ shape: 'parallel', concurrency: 3, groups: [{ name: 'a', tasks: ['1'] }, { name: 'b', tasks: ['2'], after: ['a'] }] })
    if (label === 'q build group a retry') retryPrompt = prompt
    if (label.includes(' group ')) return closed
    if (label === 'q build merge a') return { merged: false, diagnostic: 'TypeError at join' }
    if (label.includes(' merge ')) return { merged: true }
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  }
  const { calls } = await run({ ...base, features: [{ slug: 'q', from: 'build', to: 'build' }] }, s)
  assert.match(retryPrompt, /TypeError at join/)
  assert.equal(calls.filter(l => l === 'q build merge a').length, 2)
  assert.ok(!calls.includes('q build group b'))
})

await test('parallel: merges happen one at a time', async () => {
  let inTrain = 0, most = 0
  const s = async label => {
    if (label.endsWith('build plan')) return ready({ shape: 'parallel', concurrency: 3, groups: [{ name: 'a', tasks: ['1'] }, { name: 'b', tasks: ['2'] }, { name: 'c', tasks: ['3'] }] })
    if (label.includes(' group ')) return closed
    if (label.includes(' merge ')) { inTrain++; most = Math.max(most, inTrain); await sleep(5); inTrain--; return { merged: true } }
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  }
  await run({ ...base, features: [{ slug: 'r', from: 'build', to: 'build' }] }, s)
  assert.equal(most, 1)
})

await test('a build plan that is waiting stops before any builder', async () => {
  const { out, calls } = await run({ ...base, features: [{ slug: 'x', from: 'build', to: 'verify' }] },
    label => (label.endsWith('build plan') ? { outcome: 'waiting', summary: 'Q-9', questions: ['Q-9'] } : done))
  assert.deepEqual(calls, ['x build plan', 'x build record'])
  assert.equal(out.results[0].outcome, 'waiting'); assert.deepEqual(out.results[0].questions, ['Q-9'])
})

await test('verify-only failure stays inside the requested range', async () => {
  const { out, calls } = await run({ ...base, features: [{slug:'v', from:'verify', to:'verify'}] },
    () => ({ outcome:'failed', summary:'regression' }))
  assert.deepEqual(calls, ['v verify', 'v verify record'])
  assert.equal(out.results[0].outcome, 'failed')
})

await test('a chain listed backwards propagates a waiting root', async () => {
  const features = ['leaf', 'middle', 'root'].map((slug, index, all) => ({
    slug, from:'gaps', to:'gaps', after: all.slice(index + 1, index + 2),
  }))
  const { out } = await run({ ...base, features }, () => ({ outcome:'waiting', summary:'Q-1' }))
  assert.deepEqual(out.results.map(r => r.outcome), ['blocked', 'blocked', 'waiting'])
})

await test('a rejected verify check never finalizes', async () => {
  const { out, calls } = await run({ ...base, features:[{slug:'v', from:'verify', to:'verify'}] },
    label => label.endsWith('check') ? { pass:false, problems:['new failure'] } : done)
  assert.equal(out.results[0].outcome, 'error')
  assert.ok(!calls.includes('v verify finalize'))
  assert.equal(calls.at(-1), 'v verify record')
})

await test('group dispatch respects a lower cap', async () => {
  let active = 0, peak = 0
  const { out } = await run({ ...base, features:[{slug:'p', from:'build', to:'build'}] }, async label => {
    if (label.endsWith('plan')) return ready({shape:'parallel', concurrency:1,
      groups:['a','b','c'].map(name => ({name, tasks:[name]}))})
    if (label.includes(' group ')) {
      peak = Math.max(peak, ++active)
      await sleep(5)
      active--
      return closed
    }
    if (label.includes(' merge ')) return {merged:true}
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  })
  assert.equal(out.results[0].outcome, 'done')
  assert.equal(peak, 1)
})

await test('a retry requesting a seam change drains and replans before another group starts', async () => {
  const features = [{slug:'p', from:'build', to:'build'}]
  const { calls, out } = await run({ ...base, features }, (label, prompt, n) => {
    if (label.endsWith('build plan')) return n === 1
      ? ready({shape:'parallel', concurrency:1, groups:[{name:'a',tasks:['1']},{name:'b',tasks:['2']}]})
      : ready({shape:'sequential', tasks:[{id:'1'},{id:'2'}]})
    if (label.endsWith('group a retry')) return {outcome:'blocked', summary:'update shared seam'}
    if (label.endsWith('merge a')) return {merged:false, diagnostic:'type mismatch'}
    if (label.endsWith('contract wave') || label.includes(' group ') || label.includes(' task ')) return closed
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  })
  assert.equal(out.results[0].outcome, 'done')
  assert.ok(calls.includes('p build contract wave'))
  assert.ok(calls.includes('p build task 2'))
  assert.ok(!calls.includes('p build group b'))
})

await test('duplicate feature names are rejected before dispatch', async () => {
  for (const mode of ['develop','flow']) {
    let writes = 0
    await assert.rejects(run({...base, mode, features:[{slug:'dup'},{slug:'dup'}]}, () => { writes++; return done }), /unique/)
    assert.equal(writes, 0)
  }
})

await test('malformed dependency lists fail before any writer starts', async () => {
  let writers = 0
  const features = [{slug:'a',from:'gaps',to:'gaps'}, {slug:'b',from:'gaps',to:'gaps',after:'a'}]
  await assert.rejects(run({...base,features}, () => { writers++; return done }), /array/)
  assert.equal(writers,0)
})

await test('a missing reviewer leaves the candidate intact', async () => {
  const features = [{slug:'a',from:'gaps',to:'gaps'}]
  const { out, calls } = await run({...base,features}, label => label.endsWith('check') ? null : done)
  assert.equal(out.results[0].outcome, 'error')
  assert.match(out.results[0].summary, /unavailable/)
  assert.deepEqual(calls, ['a gaps','a gaps check','a gaps record'])
})

await test('landing checks name their own immutable task revisions', async () => {
  const features = [{slug:'a',from:'build',to:'build'}]
  const observed = []
  await run({...base,features}, (label, prompt) => {
    if (label.endsWith('plan')) return ready({shape:'sequential',tasks:[{id:'1'},{id:'2'}]})
    if (label.includes(' task ')) return {...closed, commit:label.at(-1).repeat(40)}
    if (label.includes(' test ')) observed.push([label.at(-1), prompt])
    return label.endsWith('finish') ? done : label.endsWith('check') ? pass : ok
  })
  assert.equal(observed.length, 2)
  for (const [id,prompt] of observed) assert.ok(prompt.includes(id.repeat(40)))
})

await test('distinct later contract requests each receive recovery', async () => {
  let plans = 0, waves = 0
  const { out } = await run({...base,features:[{slug:'contracts',from:'build',to:'build'}]}, label => {
    if (label.endsWith('plan')) {
      plans++
      return ready({shape:'parallel',concurrency:1,groups:[{name:'a',tasks:['1']},{name:'b',tasks:['2']}]})
    }
    if (label.endsWith('contract wave')) { waves++; return closed }
    if (label.endsWith('group a') && plans === 1) return {outcome:'blocked',summary:'Alpha seam'}
    if (label.endsWith('group b') && plans === 2) return {outcome:'blocked',summary:'Beta seam'}
    if (label.includes(' group ')) return closed
    if (label.includes(' merge ')) return {merged:true}
    return label.endsWith('check') ? pass : label.endsWith('finish') ? done : ok
  })
  assert.equal(out.results[0].outcome,'done')
  assert.equal(waves,2)
  assert.equal(plans,3)
})

await test('a repeated unresolved contract request terminates', async () => {
  let waves = 0
  const { out } = await run({...base,features:[{slug:'contracts',from:'build',to:'build'}]}, label => {
    if (label.endsWith('plan')) return ready({shape:'sequential',tasks:[{id:'1'}]})
    if (label.endsWith('contract wave')) { waves++; return closed }
    if (label.endsWith('task 1')) return {outcome:'blocked',summary:'same seam'}
    return label.endsWith('finish') ? done : ok
  })
  assert.equal(out.results[0].outcome,'error')
  assert.match(out.results[0].summary,/repeated without resolving/)
  assert.equal(waves,1)
})

await test('an exception preserves the current stage and completed trail', async () => {
  const {out,calls} = await run({...base,features:[{slug:'exception',from:'technical-plan',to:'verify'}]}, label => {
    if (label === 'exception verify check') throw new Error('review transport failed')
    return label.endsWith('check') ? pass : done
  })
  const result=out.results[0]
  assert.equal(result.stoppedAt,'verify')
  assert.equal(result.outcome,'error')
  assert.equal(result.trail.at(-1).stage,'verify')
  assert.equal(result.trail.length,5)
  assert.equal(calls.at(-1),'exception verify record')
})

await test('changing diagnostics cannot evade the contract wave limit', async () => {
  let plans=0,waves=0
  const {out}=await run({...base,contractRounds:2,features:[{slug:'bounded',from:'build',to:'build'}]},label=>{
    if(label.endsWith('plan')){plans++;return ready({shape:'sequential',tasks:[{id:'1'}]})}
    if(label.endsWith('contract wave')){waves++;return closed}
    if(label.endsWith('task 1'))return {outcome:'blocked',summary:`same seam, attempt ${plans}`}
    return label.endsWith('finish')?done:ok
  })
  assert.equal(waves,2)
  assert.equal(out.results[0].outcome,'error')
  assert.match(out.results[0].summary,/contract recovery limit/)
})

await test('a thrown group error drains other workers and merges before return', async () => {
  let active=0,merged=false
  const {out}=await run({...base,features:[{slug:'drain',from:'build',to:'build'}]},async label=>{
    if(label.endsWith('plan'))return ready({shape:'parallel',concurrency:2,groups:[{name:'a',tasks:['1']},{name:'b',tasks:['2']}]})
    if(label.endsWith('group a')){await sleep(5);throw new Error('transport failed')}
    if(label.endsWith('group b')){active++;await sleep(30);active--;return closed}
    if(label.endsWith('merge b')){merged=true;return {merged:true}}
    if(label.endsWith('finish')){assert.equal(active,0);assert.equal(merged,true);return done}
    return ok
  })
  assert.equal(active,0)
  assert.equal(merged,true)
  assert.equal(out.results[0].outcome,'error')
})


await test('a checker cannot approve while reporting problems', async () => {
  const {out,calls}=await run({...base,features:[{slug:'contradiction',from:'verify',to:'verify'}]},label=>
    label.endsWith('check') ? {...pass,problems:['AC-1 failed']} : done)
  assert.equal(out.results[0].outcome,'error')
  assert.equal(calls.includes('contradiction verify finalize'),false)
  assert.equal(calls.at(-1),'contradiction verify record')
})

await test('finalizer failure requests a stop record without rebuilding product code', async () => {
  for (const value of [null,{outcome:'failed',summary:'delivery problem'},{outcome:'error',summary:'delivery error'}]) {
    const {out,calls}=await run({...base,features:[{slug:'delivery',from:'build',to:'verify'}]},label=>
      label.endsWith('finalize') ? value : label.endsWith('check') ? pass : done)
    assert.equal(out.results[0].outcome,'error')
    assert.equal(calls.filter(x=>x==='delivery build plan').length,1)
    assert.equal(calls.at(-1),'delivery verify record')
  }
})

await test('pending contract changes prevent a fresh merge-retry writer', async () => {
  let plans=0
  const {out,calls}=await run({...base,features:[{slug:'retry',from:'build',to:'build'}]},async label=>{
    if(label.endsWith('plan'))return ++plans===1 ? ready({shape:'parallel',concurrency:2,groups:[{name:'a',tasks:['1']},{name:'b',tasks:['2']}]}) : ready({shape:'sequential',tasks:[]})
    if(label.endsWith('group a'))return {outcome:'blocked',summary:'seam change'}
    if(label.endsWith('group b')){await sleep(10);return closed}
    if(label.endsWith('merge b'))return {merged:false,diagnostic:'old seam failed'}
    if(label.endsWith('contract wave'))return closed
    return label.endsWith('check')?pass:label.endsWith('finish')?done:ok
  })
  assert.equal(calls.includes('retry build group b retry'),false)
  assert.equal(calls.filter(x=>x.endsWith('contract wave')).length,1)
  assert.equal(out.results[0].outcome,'done')
})

await test('contract recovery preserves independent acceptance and sibling failures', async () => {
  for (const failure of ['acceptance','sibling']) {
    const {out,calls}=await run({...base,features:[{slug:'mixed',from:'build',to:'build'}]},label=>{
      if(label.endsWith('plan'))return ready({shape:'parallel',concurrency:2,groups:[{name:'a',tasks:['1']},{name:'b',tasks:['2']}]})
      if(label.endsWith('group a'))return {outcome:'blocked',summary:'seam change'}
      if(label.endsWith('group b'))return failure==='sibling'?{outcome:'open',summary:'sibling check failed'}:closed
      if(label.endsWith('merge b'))return {merged:true}
      if(label.endsWith('acceptance tests'))return failure==='acceptance'?{pass:false,summary:'acceptance failed'}:ok
      if(label.endsWith('contract wave'))return closed
      return label.endsWith('finish')?done:ok
    })
    assert.equal(calls.filter(x=>x.endsWith('contract wave')).length,1)
    assert.equal(out.results[0].outcome,'error')
    assert.match(out.results[0].summary,new RegExp(failure))
    assert.match(out.results[0].summary,/other build failures remain/)
  }
})


await test('rejection recorder completes before repair and retains the diagnosis on repair crash', async () => {
  const records=[]
  const {out,calls}=await run({...base,features:[{slug:'crash',from:'verify',to:'verify'}]},label=>{
    if(label.endsWith('check'))return {pass:false,problems:['AC-7 route disconnected']}
    if(label.endsWith('repair')){assert.equal(records.length,1);throw new Error('repair transport crash')}
    return done
  },(label,prompt)=>{records.push(prompt);return done})
  assert.equal(out.results[0].outcome,'error')
  assert.ok(calls.indexOf('crash verify record')<calls.indexOf('crash verify repair'))
  assert.equal(records.length,2)
  for(const prompt of records)assert.match(prompt,/AC-7 route disconnected/)
})

await test('failure to persist rejection prevents starting repair', async () => {
  const {out,calls}=await run({...base,features:[{slug:'disk',from:'gaps',to:'gaps'}]},label=>
    label.endsWith('check')?{pass:false,problems:['missing coverage']}:done,()=>null)
  assert.equal(out.results[0].outcome,'error')
  assert.match(out.results[0].summary,/could not record/)
  assert.equal(calls.includes('disk gaps repair'),false)
})

await test('scheduler-generated build failures request stopped records', async () => {
  for(const invalidPlan of [true,false]) {
    const records=[]
    const {out}=await run({...base,features:[{slug:'record',from:'build',to:'build'}]},label=>{
      if(label.endsWith('plan'))return invalidPlan?{outcome:'ready',shape:'invalid'}:ready({shape:'sequential',tasks:[{id:'1'}]})
      if(label.endsWith('task 1'))return {outcome:'closed',summary:'missing sha'}
      return label.endsWith('finish')?done:ok
    },(label,prompt)=>{records.push(prompt);return done})
    assert.equal(out.results[0].outcome,'error')
    assert.equal(records.length,1)
    assert.match(records[0],/Set stage to build and state to stopped/)
  }
})

for (const r of results) console.log(r.join('  '))
const failed = results.filter(r => r[0] === 'FAIL').length
console.log(`${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
