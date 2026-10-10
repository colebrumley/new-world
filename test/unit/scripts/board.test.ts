import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Run the board as a session in `worktree` would, against a board of the test's own. */
function board(dir: string, worktree: string, ...args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync('node', ['scripts/board.mjs', ...args], { encoding: 'utf8', env: { ...process.env, BOARD_DIR: dir, BOARD_WORKTREE: worktree }, stdio: 'pipe' });
    return { ok: true, out };
  } catch (error) {
    return { ok: false, out: String((error as { stderr?: unknown }).stderr) };
  }
}

describe('the board shared by every worktree', () => {
  it('gives a requirement to one worktree at a time, and tells the other who has it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-'));
    const [a, b] = [mkdtempSync(join(tmpdir(), 'wt-a-')), mkdtempSync(join(tmpdir(), 'wt-b-'))] as [string, string];
    expect(board(dir, a, 'claim', 'R-804', 'computer', 'powers').ok).toBe(true);
    expect(board(dir, a, 'claim', 'R-804').ok).toBe(true); // claiming again what is yours is no error
    const refused = board(dir, b, 'claim', 'R-804');
    expect(refused.ok).toBe(false);
    expect(refused.out).toContain(`R-804 is taken by`);
    expect(refused.out).toContain(a);
    expect(board(dir, b, 'release', 'R-804').ok).toBe(false);
    expect(board(dir, a, 'release', 'R-804').ok).toBe(true);
    expect(board(dir, b, 'claim', 'R-804').ok).toBe(true);
  });

  it('lets a claim go when its worktree no longer exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-'));
    expect(board(dir, join(tmpdir(), 'no-such-worktree-anywhere'), 'claim', 'R-805').ok).toBe(true);
    expect(board(dir, mkdtempSync(join(tmpdir(), 'wt-')), 'status').out).toContain('worktree gone');
    expect(board(dir, mkdtempSync(join(tmpdir(), 'wt-')), 'claim', 'R-805').ok).toBe(true);
  });

  it('gives a lapsed claim to exactly one of many sessions asking at once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-'));
    expect(board(dir, join(tmpdir(), 'no-such-worktree-anywhere'), 'claim', 'R-806').ok).toBe(true);
    const worktrees = Array.from({ length: 8 }, () => mkdtempSync(join(tmpdir(), 'wt-')));
    const won = await Promise.all(
      worktrees.map(
        (worktree) =>
          new Promise<boolean>((done) => {
            execFile('node', ['scripts/board.mjs', 'claim', 'R-806'], { env: { ...process.env, BOARD_DIR: dir, BOARD_WORKTREE: worktree } }, (error) => done(!error));
          }),
      ),
    );
    expect(won.filter(Boolean)).toHaveLength(1);
    const holder = (JSON.parse(readFileSync(join(dir, 'claims', 'R-806.json'), 'utf8')) as { worktree: string }).worktree;
    expect(holder).toBe(worktrees[won.indexOf(true)]);
  });

  it('shows claims and notes to everyone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'board-'));
    const [a, b] = [mkdtempSync(join(tmpdir(), 'wt-a-')), mkdtempSync(join(tmpdir(), 'wt-b-'))] as [string, string];
    board(dir, a, 'claim', 'R-900', 'the', 'save', 'format');
    board(dir, a, 'note', 'main', 'has', 'a', 'new', 'save', 'version');
    const seen = board(dir, b, 'status').out;
    expect(seen).toMatch(/R-900 .*: the save format/);
    expect(seen).toContain('main has a new save version');
    expect(seen).toContain('claimed R-900');
    expect(board(dir, b, 'claim', 'not a name').ok).toBe(false);
  });
});
