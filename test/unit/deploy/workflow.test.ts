// R-1008: the GitHub Pages workflow is checked with actionlint (the wasm build, a dev dependency).
// This lints the file; it does not run it. Running it needs the repository on GitHub.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLinter } from 'actionlint';
import { describe, expect, it } from 'vitest';

const PATH = '.github/workflows/deploy.yml';
const source = readFileSync(join(__dirname, '../../..', PATH), 'utf8');

describe('the deploy workflow', () => {
  it('passes actionlint', async () => {
    const lint = await createLinter();
    const problems = lint(source, PATH);
    expect(problems.map((p) => `${p.line}:${p.column} ${p.kind}: ${p.message}`)).toEqual([]);
  });

  it('actionlint does notice a broken workflow', async () => {
    const lint = await createLinter();
    expect(lint(source.replace('runs-on: ubuntu-latest', 'runs-on: ubuntu-imaginary'), PATH).length).toBeGreaterThan(0);
    expect(lint(source.replace('needs: check', 'needs: nobody'), PATH).length).toBeGreaterThan(0);
  });

  it('checks before it publishes, and publishes the build', () => {
    const at = (text: string): number => source.indexOf(text);
    for (const step of ['npm ci', 'npm run check', 'npm run test:e2e', 'actions/upload-pages-artifact', 'actions/deploy-pages']) expect(at(step), step).toBeGreaterThan(-1);
    expect(at('npm ci')).toBeLessThan(at('npm run check'));
    expect(at('npm run check')).toBeLessThan(at('npm run test:e2e'));
    expect(at('npm run test:e2e')).toBeLessThan(at('actions/upload-pages-artifact'));
    expect(at('actions/upload-pages-artifact')).toBeLessThan(at('actions/deploy-pages'));
    expect(source).toMatch(/branches: \[main\]/);
    expect(source).toMatch(/path: dist/);
  });
});
