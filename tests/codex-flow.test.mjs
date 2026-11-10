import test from 'node:test';
import assert from 'node:assert/strict';
import { startFlow } from '../scripts/codex-flow.mjs';

const args = features => ({ mode: 'flow', repo: '/repo', pluginRoot: '/plugin', features });
const one = () => startFlow(args([{ slug: 'one', from: 'technical-plan', to: 'technical-plan' }]));
const done = { outcome: 'done', summary: 'stage files written' };
const pass = { pass: true, problems: [] };

test('queue drives a real scheduler stage and its independent check', async () => {
  const run = one();
  let s = await run.snapshot();
  assert.equal(s.jobs.length, 1);
  const j = run.claim(s.jobs[0].id);
  assert.match(j.prompt, /technical-plan/);
  assert.match(j.prompt, /\/plugin\/conventions.md/);
  run.complete(j.id, done);
  s = await run.snapshot();
  assert.equal(s.jobs[0].options.label, 'one technical-plan check');
  assert.match(s.jobs[0].prompt, /Trust no summary/);
  run.claim(s.jobs[0].id); run.complete(s.jobs[0].id, pass);
  s = await run.snapshot();
  assert.equal(s.state, 'done');
  assert.equal(s.result.results[0].outcome, 'done');
});

test('bad agent JSON cannot satisfy a checker or silently consume its job', async () => {
  const run = one(); let s = await run.snapshot();
  const id = s.jobs[0].id;
  assert.throws(() => run.complete(id, done), /not running/);
  run.claim(id);
  assert.throws(() => run.complete(id, { outcome: 'invented', summary: 'x' }), /enum/);
  assert.throws(() => run.complete(id, { outcome: 'done' }), /required/);
  run.complete(id, done); s = await run.snapshot();
  const check = s.jobs[0].id; run.claim(check);
  assert.throws(() => run.complete(check, { pass: 'true', problems: [] }), /boolean/);
  run.complete(check, { pass: false, problems: ['AC-1 missing'] });
  s = await run.snapshot();
  assert.match(s.jobs[0].options.label, /repair$/);
  assert.match(s.jobs[0].prompt, /AC-1 missing/);
  const repair = s.jobs[0].id; run.claim(repair);run.complete(repair, done);
  s = await run.snapshot();const recheck=s.jobs[0].id;
  run.claim(recheck);run.complete(recheck,pass);
  assert.equal((await run.snapshot()).result.results[0].outcome, 'done');
  assert.throws(() => run.complete(recheck,pass), /not running/);
});

test('failed agent blocks dependents while independent feature completes', async () => {
  const run = startFlow(args([
    { slug: 'a', from: 'gaps', to: 'gaps' },
    { slug: 'b', from: 'gaps', to: 'gaps', after: ['a'] },
    { slug: 'c', from: 'gaps', to: 'gaps' },
  ]));
  const s = await run.snapshot();
  assert.deepEqual(s.jobs.map(j=>j.options.label), ['a gaps','c gaps']);
  for (const j of s.jobs) { run.claim(j.id); if(j.options.label.startsWith('a'))run.fail(j.id);else run.complete(j.id,done); }
  const s2=await run.snapshot();
  assert.equal(s2.jobs.length,1);assert.equal(s2.jobs[0].options.label,'c gaps check');
  run.claim(s2.jobs[0].id);run.complete(s2.jobs[0].id,pass);
  const result=(await run.snapshot()).result.results;
  assert.deepEqual(result.map(r=>r.outcome),['error','blocked','done']);
});

test('develop mode validates nested answer schemas and returns questions', async () => {
  const run=startFlow({mode:'develop',repo:'/repo',pluginRoot:'/plugin',features:[{slug:'one'}]});
  const s=await run.snapshot();const id=s.jobs[0].id;run.claim(id);
  const result={brief:'/repo/.epic-flow/one/brief.md',summary:'draft',questions:[],forUser:[],assumed:0,status:'draft'};
  assert.throws(()=>run.complete(id,{...result,forUser:[{id:'q'}]}),/required/);
  run.complete(id,result);
  assert.equal((await run.snapshot()).result.mode,'develop');
});

test('reject ambiguous or unsafe run arguments', () => {
  assert.throws(()=>startFlow({...args([{slug:'../escape'}])}),/kebab-case/);
  assert.throws(()=>startFlow(args([{slug:'a'},{slug:'a'}])),/unique/);
  assert.throws(()=>startFlow({...args([{slug:'a'}]),verifyRounds:-1}),/nonnegative/);
  assert.throws(()=>startFlow({...args([{slug:'a'}]),mode:'unknown'}),/mode/);
});

test('a dependent builder waits for producer landing tests, while independent tasks proceed', async () => {
  const run = startFlow(args([{slug:'one', from:'build', to:'build'}]));
  let s = await run.snapshot();
  const answer = (job, value) => {run.claim(job.id);run.complete(job.id,value);};
  answer(s.jobs[0], {outcome:'ready',summary:'s',shape:'sequential',tasks:[
    {id:'001'}, {id:'002'}, {id:'003',dependsOn:['001']}
  ]});
  s=await run.snapshot();
  answer(s.jobs.find(j=>j.options.label.endsWith('acceptance tests')), {pass:true,summary:'s'});
  answer(s.jobs.find(j=>j.options.label.endsWith('prepare 001')), {pass:true,summary:'s'});
  s=await run.snapshot();
  answer(s.jobs.find(j=>j.options.label.endsWith('prepare 002')), {pass:true,summary:'s'});
  answer(s.jobs.find(j=>j.options.label.endsWith('task 001')), {outcome:'closed',summary:'s'});
  s=await run.snapshot();
  assert.ok(s.jobs.some(j=>j.options.label.endsWith('task 002')));
  const producerTest=s.jobs.find(j=>j.options.label.endsWith('test 001'));
  answer(s.jobs.find(j=>j.options.label.endsWith('prepare 003')), {pass:true,summary:'s'});
  answer(s.jobs.find(j=>j.options.label.endsWith('task 002')), {outcome:'closed',summary:'s'});
  s=await run.snapshot();
  assert.ok(!s.jobs.some(j=>j.options.label.endsWith('task 003')));
  answer(producerTest,{pass:false,summary:'001 broke'});
  answer(s.jobs.find(j=>j.options.label.endsWith('test 002')), {pass:true,summary:'s'});
  s=await run.snapshot();
  assert.ok(!s.jobs.some(j=>j.options.label.endsWith('task 003')));
  assert.match(s.jobs[0].prompt,/task 003 skipped/);
  answer(s.jobs[0],{outcome:'error',summary:'dependency failed'});
  assert.equal((await run.snapshot()).result.results[0].outcome,'error');
});

test('a missing landing-test agent stops its dependent builder', async () => {
  const run=startFlow(args([{slug:'one',from:'build',to:'build'}]));
  const answer=(j,value)=>{run.claim(j.id);run.complete(j.id,value);};
  let s=await run.snapshot();
  answer(s.jobs[0],{outcome:'ready',summary:'s',shape:'sequential',tasks:[{id:'001'},{id:'002',dependsOn:['001']}]});
  s=await run.snapshot();
  for(const j of s.jobs)answer(j,{pass:true,summary:'s'});
  s=await run.snapshot();
  answer(s.jobs.find(j=>j.options.label.endsWith('prepare 002')),{pass:true,summary:'s'});
  answer(s.jobs.find(j=>j.options.label.endsWith('task 001')),{outcome:'closed',summary:'s'});
  s=await run.snapshot();
  assert.equal(s.jobs.length,1);
  run.claim(s.jobs[0].id);run.fail(s.jobs[0].id);
  s=await run.snapshot();
  assert.equal(s.jobs[0].options.label,'one build finish');
  assert.match(s.jobs[0].prompt,/test agent did not return/);
  assert.match(s.jobs[0].prompt,/task 002 skipped/);
  answer(s.jobs[0],{outcome:'error',summary:'missing tester'});
  assert.equal((await run.snapshot()).result.results[0].outcome,'error');
});

async function drive(run, respond) {
  const labels=[];
  for(let round=0;round<30;round++) {
    const s=await run.snapshot();
    if(s.state!=='running')return {snapshot:s,labels};
    assert.ok(s.jobs.length,'scheduler stalled');
    for(const job of s.jobs) {
      assert.equal(job.state,'queued');
      labels.push(job.options.label);run.claim(job.id);
      const result=respond(job);
      if(result===null)run.fail(job.id);else run.complete(job.id,result);
    }
  }
  throw new Error('scheduler did not terminate');
}

test('ready plans require shape, collection and unique dependency-ordered tasks', async () => {
  for(const plan of [
    {outcome:'ready',summary:'missing shape'},
    {outcome:'ready',summary:'missing tasks',shape:'sequential'},
    {outcome:'ready',summary:'duplicate',shape:'sequential',tasks:[{id:'1'},{id:'1'}]},
    {outcome:'ready',summary:'backwards',shape:'sequential',tasks:[{id:'2',dependsOn:['1']},{id:'1'}]},
    {outcome:'ready',summary:'shared writer',shape:'parallel',groups:[{name:'a',tasks:['1']},{name:'b',tasks:['1']}]},
  ]) {
    const result=await drive(startFlow(args([{slug:'one',from:'build',to:'build'}])),()=>plan);
    assert.equal(result.snapshot.result.results[0].outcome,'error');
    assert.deepEqual(result.labels,['one build plan']);
  }
});

test('failed or missing acceptance authoring prevents a done build', async () => {
  for(const response of [{pass:false,summary:'could not write acceptance tests'},null]) {
    const result=await drive(startFlow(args([{slug:'one',from:'build',to:'build'}])),job=>{
      if(job.options.label.endsWith(' plan'))return {outcome:'ready',summary:'s',shape:'sequential',tasks:[]};
      if(job.options.label.endsWith('acceptance tests'))return response;
      return done;
    });
    assert.equal(result.snapshot.result.results[0].outcome,'error');
    assert.match(result.snapshot.result.results[0].summary,/acceptance tests failed/);
    assert.ok(!result.labels.some(label=>label.endsWith(' check')));
  }
});

test('failed contract waves do not release a group retry or its dependents', async () => {
  const result=await drive(startFlow(args([{slug:'one',from:'build',to:'build'}])),job=>{
    const label=job.options.label;
    if(label.endsWith(' plan'))return {outcome:'ready',summary:'s',shape:'parallel',groups:[{name:'a',tasks:['1']},{name:'b',tasks:['2'],after:['a']}]};
    if(label.endsWith('acceptance tests'))return {pass:true,summary:'s'};
    if(label.endsWith('group a'))return {outcome:'blocked',summary:'needs contract'};
    if(label.endsWith('contract wave a'))return {outcome:'open',summary:'contract checks failed'};
    return done;
  });
  assert.equal(result.snapshot.result.results[0].outcome,'error');
  assert.match(result.snapshot.result.results[0].summary,/contract checks failed/);
  assert.ok(!result.labels.some(label=>/retry|group b|merge a/.test(label)));
});

test('constructor is an ordinary feature slug, including as a prerequisite', async () => {
  const result=await drive(startFlow(args([
    {slug:'constructor',from:'gaps',to:'gaps'},
    {slug:'dependent',from:'gaps',to:'gaps',after:['constructor']},
  ])),job=>job.options.label.endsWith(' check')?pass:done);
  assert.deepEqual(result.snapshot.result.results.map(r=>r.outcome),['done','done']);
  assert.ok(result.labels.indexOf('dependent gaps')>result.labels.indexOf('constructor gaps check'));
});
