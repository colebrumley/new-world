import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const sh = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Run the guard as the hook would, for `command` typed in `cwd`; the decision it printed, if any. */
function guard(cwd: string, command: string, words: string): { decision: string; reason: string } {
  const out = execFileSync('node', [join(process.cwd(), 'scripts/guard.mjs')], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, GUARD_WORDS: words },
  });
  if (!out.trim()) return { decision: 'allow', reason: '' };
  const json = JSON.parse(out) as { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string }; systemMessage?: string };
  return { decision: json.hookSpecificOutput?.permissionDecision ?? 'allow', reason: json.hookSpecificOutput?.permissionDecisionReason ?? json.systemMessage ?? '' };
}

let main: string;
let worktree: string;
let words: string;

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'));
  main = join(root, 'repo');
  const origin = join(root, 'origin.git');
  execFileSync('git', ['init', '--bare', '-q', origin]);
  execFileSync('git', ['init', '-q', '-b', 'main', main]);
  sh(main, 'config', 'user.email', 'test@example.com');
  sh(main, 'config', 'user.name', 'test');
  writeFileSync(join(main, 'README.md'), 'hello\n');
  sh(main, 'add', '.');
  sh(main, 'commit', '-q', '-m', 'first');
  sh(main, 'remote', 'add', 'origin', origin);
  sh(main, 'push', '-q', 'origin', 'main');
  worktree = join(main, '.claude', 'worktrees', 'wt');
  sh(main, 'worktree', 'add', '-q', worktree, '-b', 'wt');
  words = join(root, 'words.txt');
  writeFileSync(words, '# comment\nforbidden\\s*word\n\\bzorblax\\b\n');
});

describe('the guard hook', () => {
  it('refuses changes, branch switches and suites in the main checkout, and allows them in a worktree', () => {
    for (const command of ['git commit -m x', 'git checkout -b y', 'git stash', 'npm test', 'npm run check', 'npx vitest run foo']) {
      expect(guard(main, command, words).decision, command).toBe('deny');
      expect(guard(main, command, words).reason).toContain('main checkout');
      expect(guard(worktree, command, words).decision, command).toBe('allow');
    }
  });

  it('follows a leading cd or a git -C, and lets the main checkout do what is read-only or cleanup', () => {
    expect(guard(worktree, `cd ${main} && git commit -m x`, words).decision).toBe('deny');
    expect(guard(worktree, `git -C ${main} reset --hard`, words).decision).toBe('deny');
    expect(guard(main, `git -C "${worktree}" commit -m x`, words).decision).toBe('allow');
    expect(guard(main, `cd ${worktree} && git commit -m x`, words).decision).toBe('allow');
    for (const command of ['git status', 'git log --oneline', 'git worktree add .claude/worktrees/z -b z origin/main', 'git branch -D z', 'git push origin --delete z', 'git worktree prune', 'npm run board', 'npm run tidy']) {
      expect(guard(main, command, words).decision, command).toBe('allow');
    }
  });

  it('refuses a commit whose message or staged text matches the word list, and says where', () => {
    expect(guard(worktree, 'git commit -m "mentions a forbidden word"', words).decision).toBe('deny');
    writeFileSync(join(worktree, 'note.md'), 'nothing to see\nbut zorblax is here\n');
    const refused = guard(worktree, 'git add note.md && git commit -m "ok"', words);
    expect(refused.decision).toBe('deny');
    expect(refused.reason).toContain('note.md');
    expect(refused.reason).toContain('zorblax');
    writeFileSync(join(worktree, 'note.md'), 'nothing to see\n');
    expect(guard(worktree, 'git add note.md && git commit -m "ok"', words).decision).toBe('allow');
  });

  it('sees what is staged even when the working copy was restored, and reads message files', () => {
    writeFileSync(join(worktree, 'staged.md'), 'a zorblax here\n');
    sh(worktree, 'add', 'staged.md');
    writeFileSync(join(worktree, 'staged.md'), 'clean now\n');
    expect(guard(worktree, 'git commit -m "ok"', words).reason).toContain('staged changes');
    sh(worktree, 'reset', '-q', '--', 'staged.md');
    rmSync(join(worktree, 'staged.md'));
    const body = join(tmpdir(), `guard-body-${process.pid}.md`);
    writeFileSync(body, 'A clean title\n\nbut a zorblax in the body\n');
    expect(guard(worktree, `git commit -F ${body}`, words).reason).toContain('message file');
    expect(guard(worktree, `gh pr create --title t --body-file "${body}"`, words).decision).toBe('deny');
    expect(guard(worktree, 'git commit -m "ok"', words).decision).toBe('allow');
  });

  it('checks the commits not yet on origin/main before a push or a pull request', () => {
    sh(worktree, 'config', 'user.email', 'test@example.com');
    sh(worktree, 'config', 'user.name', 'test');
    writeFileSync(join(worktree, 'note.md'), 'nothing to see\n');
    sh(worktree, 'add', 'note.md');
    sh(worktree, 'commit', '-q', '-m', 'a zorblax in the message');
    expect(guard(worktree, 'git push -u origin wt', words).decision).toBe('deny');
    expect(guard(worktree, 'gh pr create --title t --body b', words).decision).toBe('deny');
    expect(guard(worktree, 'git status', words).decision).toBe('allow');
    sh(worktree, 'commit', '-q', '--amend', '-m', 'a clean message');
    expect(guard(worktree, 'git push -u origin wt', words).decision).toBe('allow');
    // a body line, and text added in one commit and removed in the next, are history: still public
    sh(worktree, 'commit', '-q', '--amend', '-m', 'clean subject', '-m', 'zorblax in the body');
    expect(guard(worktree, 'git push -u origin wt', words).reason).toContain('commit messages');
    sh(worktree, 'commit', '-q', '--amend', '-m', 'clean subject');
    writeFileSync(join(worktree, 'gone.md'), 'zorblax briefly\n');
    sh(worktree, 'add', 'gone.md');
    sh(worktree, 'commit', '-q', '-m', 'add');
    sh(worktree, 'rm', '-q', 'gone.md');
    sh(worktree, 'commit', '-q', '-m', 'remove');
    expect(guard(worktree, 'git push -u origin wt', words).reason).toContain('commits not on origin/main');
    sh(worktree, 'reset', '-q', '--hard', 'HEAD~2');
    expect(guard(worktree, 'git push -u origin wt', words).decision).toBe('allow');
  });

  it('only warns when there is no word list', () => {
    const none = guard(worktree, 'git commit -m "whatever"', join(tmpdir(), 'no-such-words.txt'));
    expect(none.decision).toBe('allow');
    expect(none.reason).toContain('no word list');
  });
});
