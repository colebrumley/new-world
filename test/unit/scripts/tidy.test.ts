import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tidy = (cwd: string, ...args: string[]): string => execFileSync('node', [join(process.cwd(), 'scripts/tidy.mjs'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TIDY_GH: '0' } });

/** A main checkout with an origin, and a worktree per branch; `merged` branches are already in origin/main. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'tidy-'));
  const origin = join(root, 'origin.git');
  const main = join(root, 'repo');
  execFileSync('git', ['init', '--bare', '-q', origin]);
  execFileSync('git', ['init', '-q', '-b', 'main', main]);
  git(main, 'config', 'user.email', 'test@example.com');
  git(main, 'config', 'user.name', 'test');
  writeFileSync(join(main, 'README.md'), 'hello\n');
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'first');
  git(main, 'remote', 'add', 'origin', origin);
  git(main, 'push', '-q', '-u', 'origin', 'main');
  const branch = (name: string): string => {
    const path = join(main, '.claude', 'worktrees', name);
    git(main, 'worktree', 'add', '-q', path, '-b', name);
    git(path, 'config', 'user.email', 'test@example.com');
    git(path, 'config', 'user.name', 'test');
    writeFileSync(join(path, `${name}.txt`), `${name}\n`);
    git(path, 'add', '.');
    git(path, 'commit', '-q', '-m', name);
    git(path, 'push', '-q', '-u', 'origin', name);
    return realpathSync(path); // git reports real paths; macOS puts tmpdir behind a symlink
  };
  const merge = (name: string): void => {
    git(main, 'merge', '-q', '--no-edit', name);
    git(main, 'push', '-q', 'origin', 'main');
  };
  return { root, main, branch, merge };
}

describe('tidy', () => {
  it('removes merged, clean, idle worktrees with their branches, and keeps the rest', () => {
    const { main, branch, merge } = repo();
    const done = branch('done');
    const dirty = branch('dirty');
    const open = branch('open');
    merge('done');
    merge('dirty');
    writeFileSync(join(dirty, 'extra.txt'), 'uncommitted\n');
    // a ref log last written a day ago counts as idle
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    for (const name of ['done', 'dirty']) execFileSync('touch', ['-t', `${past.getFullYear()}${String(past.getMonth() + 1).padStart(2, '0')}${String(past.getDate()).padStart(2, '0')}0000`, join(main, '.git', 'worktrees', name, 'logs', 'HEAD')]);

    const claims = join(main, '.git', 'board', 'claims');
    mkdirSync(claims, { recursive: true });
    writeFileSync(join(claims, 'R-1.json'), JSON.stringify({ id: 'R-1', worktree: done }));
    writeFileSync(join(claims, 'R-2.json'), JSON.stringify({ id: 'R-2', worktree: open }));

    const dry = tidy(main, '--dry-run');
    expect(dry).toContain(`would remove worktree ${done}`);
    expect(dry).toContain('keep');
    expect(existsSync(done)).toBe(true);

    const out = tidy(main);
    expect(out).toContain(`remove worktree ${done}`);
    expect(out).toContain(`keep ${dirty}`);
    expect(existsSync(done)).toBe(false);
    expect(existsSync(dirty)).toBe(true);
    expect(existsSync(open)).toBe(true);
    expect(git(main, 'branch', '--list', 'done')).toBe('');
    expect(git(main, 'branch', '--list', 'open')).toContain('open');
    expect(git(main, 'ls-remote', '--heads', 'origin', 'done')).toBe('');
    expect(git(main, 'ls-remote', '--heads', 'origin', 'open')).toContain('open');
    expect(existsSync(join(claims, 'R-1.json'))).toBe(false);
    expect(existsSync(join(claims, 'R-2.json'))).toBe(true);
  });

  it('trusts a merged pull request only at the commit it merged, and only under .claude/worktrees', () => {
    const { root, main, branch } = repo();
    const squashed = branch('squashed'); // "merged" by GitHub's account, by squash: not in origin/main
    const movedOn = branch('moved-on');
    const tips = { squashed: git(squashed, 'rev-parse', 'HEAD'), movedOn: git(movedOn, 'rev-parse', 'HEAD') };
    writeFileSync(join(movedOn, 'later.txt'), 'new work after the merge\n');
    git(movedOn, 'add', '.');
    git(movedOn, 'commit', '-q', '-m', 'later');
    const elsewhere = join(root, 'manual-checkout');
    git(main, 'worktree', 'add', '-q', elsewhere, '-b', 'elsewhere');
    git(main, 'merge', '-q', '--no-edit', 'elsewhere');
    git(main, 'push', '-q', 'origin', 'main');
    for (const name of ['squashed', 'moved-on']) execFileSync('touch', ['-t', '202001010000', join(main, '.git', 'worktrees', name, 'logs', 'HEAD')]);
    const gh = join(root, 'merged.json');
    writeFileSync(gh, JSON.stringify([{ headRefName: 'squashed', headRefOid: tips.squashed }, { headRefName: 'moved-on', headRefOid: tips.movedOn }]));
    const out = execFileSync('node', [join(process.cwd(), 'scripts/tidy.mjs')], { cwd: main, encoding: 'utf8', env: { ...process.env, TIDY_GH_JSON: gh } });
    expect(out).toContain(`remove worktree ${squashed}`);
    expect(existsSync(squashed)).toBe(false);
    expect(git(main, 'ls-remote', '--heads', 'origin', 'squashed')).toBe('');
    expect(out).not.toContain('moved-on');
    expect(existsSync(movedOn)).toBe(true);
    expect(out).not.toContain('manual-checkout');
    expect(existsSync(elsewhere)).toBe(true);
  });

  it('never removes the worktree it is run from', () => {
    const { main, branch, merge } = repo();
    const self = branch('self');
    merge('self');
    execFileSync('touch', ['-t', '202001010000', join(main, '.git', 'worktrees', 'self', 'logs', 'HEAD')]);
    expect(tidy(self)).not.toContain('remove worktree');
    expect(existsSync(self)).toBe(true);
  });
});
