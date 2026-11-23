// Run in the feature worktree. Supply a configured remote only for an authorized push.
import { execFileSync } from 'node:child_process';

const [sha, branch, remote] = process.argv.slice(2);
if (process.argv.length < 4 || process.argv.length > 5 ||
    !/^(?:[\da-f]{40}|[\da-f]{64})$/.test(sha) || !branch) {
  throw new Error('usage: node verified-head.mjs <checked-sha> <feature-branch> [authorized-remote]');
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
function checkWorktree() {
  // These flags can hide tracked edits even from status and diff. Require a
  // fully visible index rather than treating an opaque worktree as verified.
  const indexes = [git('ls-files', '-v', '-z'), git('submodule', 'foreach', '--quiet', '--recursive', 'git ls-files -v -z')]
  const hidden = indexes.join('\0').split('\0').filter(entry => entry &&
    (entry[0] === 'S' || entry[0] === entry[0].toLowerCase()));
  if (hidden.length) throw new Error('cannot verify clean worktree with assume-unchanged or skip-worktree flags; clear the flags and rerun verification');
  if (git('symbolic-ref', 'HEAD') !== 'refs/heads/' + branch ||
      git('rev-parse', 'HEAD') !== sha || git('status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none') !== '') {
    throw new Error('feature branch, checked SHA and clean worktree must match');
  }
}
checkWorktree();
if (remote !== undefined) {
  if (!remote || remote.startsWith('-') || !git('remote').split('\n').includes(remote)) {
    throw new Error('use the authorized configured remote name');
  }
  const ref = 'refs/heads/' + branch;
  git('push', '--no-follow-tags', '--recurse-submodules=no', '--', remote, sha + ':' + ref);
  // Read the push destination, which may differ from the remote fetch URL.
  for (const url of git('remote', 'get-url', '--push', '--all', remote).split('\n')) {
    if (git('ls-remote', '--exit-code', '--refs', '--', url, ref) !== sha + '\t' + ref) {
      throw new Error('published feature ref differs from the checked commit');
    }
  }
}
checkWorktree();
console.log(sha);
