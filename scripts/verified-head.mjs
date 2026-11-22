// Run in the feature worktree. Supply a configured remote only for an authorized push.
import { execFileSync } from 'node:child_process';

const [sha, branch, remote] = process.argv.slice(2);
if (process.argv.length < 4 || process.argv.length > 5 ||
    !/^(?:[\da-f]{40}|[\da-f]{64})$/.test(sha) || !branch) {
  throw new Error('usage: node verified-head.mjs <checked-sha> <feature-branch> [authorized-remote]');
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
function checkWorktree() {
  if (git('symbolic-ref', 'HEAD') !== 'refs/heads/' + branch ||
      git('rev-parse', 'HEAD') !== sha || git('status', '--porcelain') !== '') {
    throw new Error('feature branch, checked SHA and clean worktree must match');
  }
}
checkWorktree();
if (remote !== undefined) {
  if (!remote || remote.startsWith('-') || !git('remote').split('\n').includes(remote)) {
    throw new Error('use the authorized configured remote name');
  }
  const ref = 'refs/heads/' + branch;
  git('push', '--', remote, sha + ':' + ref);
  // Read the push destination, which may differ from the remote fetch URL.
  for (const url of git('remote', 'get-url', '--push', '--all', remote).split('\n')) {
    if (git('ls-remote', '--exit-code', '--refs', '--', url, ref) !== sha + '\t' + ref) {
      throw new Error('published feature ref differs from the checked commit');
    }
  }
}
checkWorktree();
console.log(sha);
