// R-1008, R-1023: every workflow in .github/workflows/ is checked with actionlint (the wasm build, a
// dev dependency), and the order of the steps of the two that publish is held here. This lints the
// files; it does not run them. Running them needs the repository on GitHub.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLinter } from 'actionlint';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const WORKFLOWS = '.github/workflows';
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

describe('every workflow', () => {
  const files = readdirSync(join(ROOT, WORKFLOWS)).filter((f) => /\.ya?ml$/.test(f)).map((f) => `${WORKFLOWS}/${f}`);

  it('includes the deploy and wiki workflows', () => {
    expect(files).toEqual(expect.arrayContaining([`${WORKFLOWS}/deploy.yml`, `${WORKFLOWS}/wiki.yml`]));
  });

  it.each(files)('%s passes actionlint', async (path) => {
    const lint = await createLinter();
    const problems = lint(read(path), path);
    expect(problems.map((p) => `${p.line}:${p.column} ${p.kind}: ${p.message}`)).toEqual([]);
  });
});

describe('the deploy workflow', () => {
  const PATH = `${WORKFLOWS}/deploy.yml`;
  const source = read(PATH);

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

  it('runs only when the build or the checks could change', () => {
    // the quoted entries of the `paths:` list (not `paths-ignore:`) under one trigger of `on:`
    const paths = (trigger: string): string[] => {
      const block = source.match(new RegExp(`^  ${trigger}:\\n((?:    .*\\n)+)`, 'm'))?.[1] ?? '';
      const list = block.match(/^ {4}paths:\n((?: {6}- '.+'\n)+)/m)?.[1] ?? '';
      return [...list.matchAll(/^ {6}- '(.+)'$/gm)].map((m) => m[1]!);
    };
    // what the published build is made from: a push to main runs (and deploys) only for these
    const build = ['src/**', 'public/**', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json', PATH];
    // what the checks read as well: the tests and tooling, docs/KEYS.md (keymap.test.ts) and the art
    // sources (frontispiece.test.ts, portraits.test.ts)
    const checked = ['test/**', 'scripts/**', 'eslint.config.js', 'playwright.config.ts', 'docs/KEYS.md', 'art/**'];
    expect(paths('push')).toEqual(build);
    expect(paths('pull_request')).toEqual([...build, ...checked]);
  });
});

describe('the wiki workflow', () => {
  const PATH = `${WORKFLOWS}/wiki.yml`;
  const source = read(PATH);
  // the text of one job: from its key to the next job's key (or the end)
  const job = (name: string): string => source.match(new RegExp(`^  ${name}:\\n(?:(?: {4}.*)?\\n)+`, 'm'))?.[0] ?? '';
  const check = job('check');
  const publish = job('publish');
  const order = (text: string, steps: readonly string[]): void => {
    for (const step of steps) expect(text.indexOf(step), step).toBeGreaterThan(-1);
    for (let i = 1; i < steps.length; i++) expect(text.indexOf(steps[i - 1]!), `${steps[i - 1]} before ${steps[i]}`).toBeLessThan(text.indexOf(steps[i]!));
  };

  it('has the two jobs', () => {
    expect(check).not.toBe('');
    expect(publish).not.toBe('');
  });

  it('runs on changes to the manual, the art, its tests or itself', () => {
    const watched = ['wiki/**', 'art/**', 'test/unit/wiki/**', 'test/helpers/wiki/**', PATH];
    for (const trigger of ['push', 'pull_request']) {
      const block = source.match(new RegExp(`^  ${trigger}:\\n((?:    .*\\n)+)`, 'm'))?.[1] ?? '';
      expect([...block.matchAll(/^ {6}- '(.+)'$/gm)].map((m) => m[1]), trigger).toEqual(watched);
    }
    expect(source).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('the check job runs the wiki tests', () => {
    order(check, ['npm ci', 'npm test -- test/unit/wiki test/unit/no-copied-text test/unit/deploy']);
  });

  it('the publish job runs after check, one at a time, on pushes and by hand', () => {
    expect(publish).toMatch(/^ {4}needs: check$/m);
    expect(publish).toMatch(/^ {4}if: github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'$/m);
    expect(publish).toMatch(/^ {4}concurrency:\n {6}group: wiki\n {6}cancel-in-progress: false$/m);
    expect(publish).toMatch(/^ {4}permissions:\n {6}contents: write$/m);
  });

  it('the publish job clones the wiki, syncs wiki/, copies art/ and pushes only a change', () => {
    expect(publish).toContain('${{ secrets.WIKI_TOKEN || github.token }}@github.com/${{ github.repository }}.wiki.git');
    order(publish, [
      'git clone "$WIKI_URL"',
      '! -name .git -exec rm -rf',
      'cp -R wiki/.',
      'for folder in units places features floors buildings goods portraits title chart',
      'cp -R "art/$folder" "$RUNNER_TEMP/wiki/images/paintings/$folder"',
      "git config user.name 'github-actions[bot]'",
      'git status --porcelain',
      'git commit',
      'git push origin HEAD',
    ]);
    expect(publish).toContain('$GITHUB_SHA');
  });

  it('says in the summary why a clone or a push failed', () => {
    // the clone step writes it before the sync, and the push step after the push
    order(publish, ['git clone', 'GITHUB_STEP_SUMMARY', 'cp -R wiki/.']);
    expect(publish.lastIndexOf('GITHUB_STEP_SUMMARY')).toBeGreaterThan(publish.indexOf('git push origin HEAD'));
    expect(source).toContain('Create the first page');
    expect(source).toContain('WIKI_TOKEN');
  });

  it('does not make deploy.yml rebuild the game for a wiki change', () => {
    expect(read(`${WORKFLOWS}/deploy.yml`)).not.toMatch(/wiki/);
  });
});
