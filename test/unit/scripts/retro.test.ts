import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const line = (type: string, content: unknown, timestamp: string, extra: Record<string, unknown> = {}): string => JSON.stringify({ type, timestamp, message: { role: type, content }, ...extra });

describe('retro', () => {
  it('prints what a person typed, leaves out the automatic messages, and tallies repeats since the mark', () => {
    const root = mkdtempSync(join(tmpdir(), 'retro-'));
    const main = join(root, 'new-world');
    const projects = join(root, 'projects');
    const key = main.replace(/[/.]/g, '-');
    mkdirSync(join(projects, key), { recursive: true });
    mkdirSync(join(projects, `${key}--claude-worktrees-x`), { recursive: true });
    mkdirSync(join(projects, `${key}-tools`), { recursive: true }); // a sibling repository, not ours
    writeFileSync(join(projects, `${key}-tools`, 'c.jsonl'), line('user', 'sibling repo message', '2026-10-03T12:00:00Z'));
    const board = join(root, 'board');
    mkdirSync(board, { recursive: true });
    writeFileSync(
      join(projects, key, 'a.jsonl'),
      [
        line('user', 'merge it', '2026-10-01T10:00:00Z'),
        line('user', [{ type: 'tool_result', content: 'x' }], '2026-10-01T10:01:00Z'),
        line('assistant', [{ type: 'text', text: 'done' }], '2026-10-01T10:02:00Z'),
        line('user', '<command-name>/loop</command-name>', '2026-10-01T10:03:00Z'),
        line('user', 'This session is being continued from a previous conversation that ran out of context.', '2026-10-01T10:04:00Z'),
        line('user', 'meta', '2026-10-01T10:05:00Z', { isMeta: true }),
        line('user', [{ type: 'text', text: 'open a PR <system-reminder>hidden</system-reminder>' }], '2026-10-02T10:00:00Z'),
      ].join('\n'),
    );
    writeFileSync(join(projects, `${key}--claude-worktrees-x`, 'b.jsonl'), [line('user', 'Merge it!', '2026-10-03T10:00:00Z'), line('user', `Repo: New World. ${'x'.repeat(1300)}`, '2026-10-03T10:01:00Z')].join('\n'));
    const env = { ...process.env, RETRO_PROJECTS: projects, RETRO_MAIN: main, BOARD_DIR: board };
    const run = (...args: string[]): string => execFileSync('node', [join(process.cwd(), 'scripts/retro.mjs'), ...args], { encoding: 'utf8', env });

    const everything = run();
    expect(everything).toContain('merge it');
    expect(everything).toContain('open a PR');
    expect(everything).not.toContain('hidden');
    expect(everything).not.toContain('/loop');
    expect(everything).not.toContain('being continued');
    expect(everything).toMatch(/\[hand-off prompt, \d+ chars\] Repo: New World\./);
    expect(everything).toMatch(/\n\s+2\s+merge\n/);
    expect(everything).toMatch(/\n\s+1\s+open a PR\n/);
    expect(everything).toMatch(/\n\s+1\s+hand-off preamble\n/);
    expect(everything).toContain('--claude-worktrees-x');
    expect(everything).not.toContain('sibling repo message');

    expect(run('--mark')).toContain('marked');
    expect(run()).toContain('0 message(s)');
    expect(run('--all')).toContain('4 message(s)');
  });
});
