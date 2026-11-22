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
