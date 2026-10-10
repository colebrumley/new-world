// Removes what merged work leaves behind: worktrees under .claude/worktrees/ whose pull request has
// merged at their current tip (or whose branch is in origin/main) and that hold no uncommitted changes, their branches
// here and on origin, local or remote branches merged the same way, and board claims whose worktree
// is gone. A worktree used in the last half hour, the one this is run from, and the main checkout
// are never touched. "Used" means a commit, checkout or reset in it: its ref log's age.
//   npm run tidy                  do it
//   npm run tidy -- --dry-run     only say what would go
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const dry = process.argv.includes('--dry-run');
const useGh = process.env['TIDY_GH'] !== '0';
const git = (cwd, ...args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const say = (text) => console.log(`${dry ? 'would ' : ''}${text}`);

const here = git(process.cwd(), 'rev-parse', '--show-toplevel');
const common = resolve(process.cwd(), git(process.cwd(), 'rev-parse', '--git-common-dir'));
const main = dirname(common);
if (!here) {
  console.error('tidy: not in a git repository');
  process.exit(1);
}
git(main, 'fetch', '--prune', '--quiet', 'origin');

/**
 * Branches whose pull request merged, by GitHub's account, with the commit each was merged at: a
 * squash merge leaves the branch outside origin/main, so the name alone is not enough, and a branch
 * that has moved on since its merge may hold new work.
 */
const merged = new Map();
if (useGh) {
  try {
    const json = process.env['TIDY_GH_JSON'] ? readFileSync(process.env['TIDY_GH_JSON'], 'utf8') : execFileSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '300', '--json', 'headRefName,headRefOid'], { cwd: main, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const { headRefName, headRefOid } of JSON.parse(json)) {
      if (!merged.has(headRefName)) merged.set(headRefName, new Set());
      merged.get(headRefName).add(headRefOid);
    }
  } catch {
    console.log('tidy: gh is not available; going by origin/main alone');
  }
}
const inMain = (ref) => Boolean(ref) && execOk(main, 'merge-base', '--is-ancestor', ref, 'origin/main');
function execOk(cwd, ...args) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
/** `name` as GitHub knows the branch; `ref` where its tip is here (the name, or origin/<name>). */
const isMerged = (name, ref = name) => name !== 'main' && ((merged.get(name)?.has(git(main, 'rev-parse', ref)) ?? false) || inMain(ref));
const home = join(main, '.claude', 'worktrees') + '/';

/** The worktrees, from the main checkout's list. */
const worktrees = [];
for (const block of git(main, 'worktree', 'list', '--porcelain').split('\n\n')) {
  const path = /^worktree (.+)$/m.exec(block)?.[1];
  const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? '';
  if (path) worktrees.push({ path, branch });
}

const gone = [];
for (const { path, branch } of worktrees) {
  if (path === main || path === here || !`${path}/`.startsWith(home)) continue;
  if (!existsSync(path)) {
    say(`prune the record of ${path}, which no longer exists`);
    continue;
  }
  if (!isMerged(branch)) continue;
  // last commit, checkout or reset in the worktree: its ref log (git status would refresh the index)
  const gitdir = git(path, 'rev-parse', '--git-dir');
  const log = gitdir && join(resolve(path, gitdir), 'logs', 'HEAD');
  const idle = !log || !existsSync(log) || Date.now() - statSync(log).mtimeMs > 30 * 60 * 1000;
  if (git(path, 'status', '--porcelain')) {
    console.log(`keep ${path}: ${branch} is merged but the tree has uncommitted changes`);
    continue;
  }
  if (!idle) {
    console.log(`keep ${path}: ${branch} is merged but the tree was used in the last half hour`);
    continue;
  }
  say(`remove worktree ${path} (${branch}, merged)`);
  if (!dry) execOk(main, 'worktree', 'remove', path);
  gone.push(path);
}
if (!dry) execOk(main, 'worktree', 'prune');

const checkedOut = new Set(worktrees.filter((w) => !gone.includes(w.path)).map((w) => w.branch));
for (const branch of git(main, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter(Boolean)) {
  if (branch === 'main' || checkedOut.has(branch) || !isMerged(branch)) continue;
  say(`delete local branch ${branch} (merged)`);
  if (!dry) execOk(main, 'branch', '-D', branch);
}
for (const ref of git(main, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin/').split('\n').filter(Boolean)) {
  const branch = ref.replace(/^refs\/remotes\/origin\//, '');
  if (branch === 'main' || branch === 'HEAD' || checkedOut.has(branch) || !isMerged(branch, `origin/${branch}`)) continue;
  say(`delete origin/${branch} (merged)`);
  if (!dry) execOk(main, 'push', '--quiet', 'origin', '--delete', branch);
}

const claims = join(common, 'board', 'claims');
if (existsSync(claims)) {
  for (const name of readdirSync(claims).filter((n) => n.endsWith('.json'))) {
    const claim = JSON.parse(readFileSync(join(claims, name), 'utf8'));
    if (existsSync(claim.worktree)) continue;
    say(`release the board claim ${claim.id}: its worktree is gone`);
    if (!dry) rmSync(join(claims, name), { force: true });
  }
}
console.log(dry ? 'tidy: dry run, nothing changed' : 'tidy: done');
