import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../scripts/verified-head.mjs', import.meta.url));

test('delivery publishes the clean checked commit to the chosen push destination', t => {
  const dir = mkdtempSync(join(tmpdir(), 'epic-deliver-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const git = (...args) => execFileSync('git', args, {cwd:dir, encoding:'utf8'}).trim();
  const deliver = (...args) => execFileSync(process.execPath, [helper, ...args],
    {cwd:dir, stdio:'pipe', encoding:'utf8'}).trim();
  git('init', '-q', '-b', 'feature');
  for (const name of ['read', 'publish']) git('init', '--bare', '-q', '.git/' + name);
  git('remote', 'add', 'fork', join(dir,'.git/read'));
  git('remote', 'set-url', '--push','fork', join(dir,'.git/publish'));
  const commit = name => {
    writeFileSync(join(dir,name), name);
    git('add', name);
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm', name);
    return git('rev-parse','HEAD');
  };
  const build = commit('build');
  git('config','push.followTags','true');
  git('-c','user.name=Test','-c','user.email=test@example.invalid','tag','-a','draft','-m','draft');
  const checked = commit('acceptance-test');
  assert.equal(deliver(checked,'feature'), checked);
  assert.equal(git('--git-dir=.git/publish','for-each-ref'),'');
  assert.throws(() => deliver(build,'feature','fork'));
  assert.throws(() => deliver(checked,'other','fork'));
  assert.equal(deliver(checked,'feature','fork'),checked);
  assert.equal(deliver(checked,'feature','fork'),checked);
  assert.equal(git('--git-dir=.git/publish','rev-parse','refs/heads/feature'),checked);
  assert.equal(git('--git-dir=.git/read','for-each-ref'),'');
  assert.equal(git('--git-dir=.git/publish','tag','--list'),'');
  git('config','status.showUntrackedFiles','no');
  writeFileSync(join(dir,'dirty'),'dirty');
  assert.throws(() => deliver(checked,'feature','fork'));
});

for (const flag of ['assume-unchanged','skip-worktree']) {
  test(`delivery rejects hidden tracked edits under ${flag}`, t => {
    const dir=mkdtempSync(join(tmpdir(),'epic-hidden-'));
    t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
    git('init','-q','-b','feature');
    git('init','--bare','-q','.git/publish');
    git('remote','add','origin',join(dir,'.git/publish'));
    writeFileSync(join(dir,'tracked'),'clean');
    git('add','tracked');
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','seed');
    const sha=git('rev-parse','HEAD');
    git('update-index','--'+flag,'tracked');
    writeFileSync(join(dir,'tracked'),'hidden dirty content');
    assert.equal(git('status','--porcelain'),'');
    assert.throws(()=>execFileSync(process.execPath,[helper,sha,'feature','origin'],{cwd:dir,stdio:'pipe'}),
      error=>error.stderr.toString().includes('assume-unchanged or skip-worktree'));
    assert.equal(git('--git-dir=.git/publish','for-each-ref'),'');
  });
}

for (const flag of ['assume-unchanged','skip-worktree']) for (const depth of [1,2]) {
  test(`delivery rejects hidden submodule edits under ${flag} at depth ${depth}`, t => {
    const dir=mkdtempSync(join(tmpdir(),'epic-submodule-'));
    t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    const commit=(...prefix)=>git(...prefix,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','seed');
    git('init','-q','-b','feature');
    git('init','-q','.git/source');
    writeFileSync(join(dir,'.git/source/tracked'),'clean');
    git('-C','.git/source','add','tracked');commit('-C','.git/source');
    git('-c','protocol.file.allow=always','submodule','add',join(dir,'.git/source'),'sub');commit();
    const target=depth===1?'sub':'sub/nested';
    if(depth===2) {
      git('-C','sub','-c','protocol.file.allow=always','submodule','add',join(dir,'.git/source'),'nested');
      commit('-C','sub');git('add','sub');commit();
    }
    git('init','--bare','-q','.git/publish');
    git('remote','add','origin',join(dir,'.git/publish'));
    const sha=git('rev-parse','HEAD');
    const deliver=(...extra)=>execFileSync(process.execPath,[helper,sha,'feature',...extra],{cwd:dir,stdio:'pipe',encoding:'utf8'}).trim();
    assert.equal(deliver(),sha);
    writeFileSync(join(dir,target,'tracked'),'hidden dirty content');
    assert.throws(()=>deliver());
    git('-C',target,'update-index','--'+flag,'tracked');
    assert.equal(git('status','--porcelain','--ignore-submodules=none'),'');
    assert.throws(()=>deliver('origin'),error=>error.stderr.toString().includes('assume-unchanged or skip-worktree'));
    assert.equal(git('--git-dir=.git/publish','for-each-ref'),'');
  });
}
