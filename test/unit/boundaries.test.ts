import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import config, { PURE_FORBIDDEN_GLOBALS, PURE_FORBIDDEN_IMPORTS, PURE_GLOBS } from '../../eslint.config.js';

const eslint = new ESLint();

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('module boundaries (C3)', () => {
  it('declares the purity rule block for engine and ai', () => {
    const block = config.find((c) => Array.isArray(c.files) && c.files.includes('src/engine/**/*.ts'));
    expect(block).toBeDefined();
    expect(PURE_GLOBS).toEqual(['src/engine/**/*.ts', 'src/ai/**/*.ts']);
    expect(PURE_FORBIDDEN_IMPORTS).toEqual(expect.arrayContaining(['**/ui/**', '**/app/**']));
    expect(PURE_FORBIDDEN_GLOBALS).toEqual(expect.arrayContaining(['window', 'document', 'fetch']));
    expect(Object.keys(block?.rules ?? {})).toEqual(
      expect.arrayContaining(['no-restricted-imports', 'no-restricted-globals', 'no-restricted-properties']),
    );
  });

  it.each([
    ["import { x } from '../ui/index';\nexport const y = x;", 'no-restricted-imports'],
    ["import { x } from '../../app/boot';\nexport const y = x;", 'no-restricted-imports'],
    ['export const w = window.innerWidth;', 'no-restricted-globals'],
    ["export const el = document.querySelector('a');", 'no-restricted-globals'],
    ["export const r = fetch('/x');", 'no-restricted-globals'],
    ['export const r = Math.random();', 'no-restricted-properties'],
    ['export const t = Date.now();', 'no-restricted-properties'],
    ['export const t = new Date();', 'no-restricted-syntax'],
  ])('rejects %j inside src/engine', async (code, rule) => {
    expect(await ruleIdsFor(code, 'src/engine/fixture.ts')).toContain(rule);
    expect(await ruleIdsFor(code, 'src/ai/fixture.ts')).toContain(rule);
  });

  it('allows the same code in src/ui', async () => {
    expect(await ruleIdsFor('export const w = window.innerWidth + Math.random();', 'src/ui/fixture.ts')).toEqual([]);
  });

  it('the current engine and ai trees pass lint', async () => {
    const results = await eslint.lintFiles(['src/engine', 'src/ai']);
    expect(results.length).toBeGreaterThan(0);
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}: ${m.message}`))).toEqual([]);
  });
});
