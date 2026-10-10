// The adversarial review a change gets before its pull request: Codex (the OpenAI CLI, installed on
// this machine) reads the branch's diff against origin/main as a hostile reviewer, in a read-only
// sandbox, and reports findings by severity. The worker fixes every P1 and P2 it confirms, runs
// this once more, and merges only when the verdict is CLEAN. Commit first: it reads the commits.
//   npm run review                  this branch against origin/main
//   npm run review -- --base <ref>  another base
// The full report goes to <git common dir>/private/reviews/ (never tracked); the verdict and the
// findings are printed. Exit 0 when CLEAN, 1 when there are P1 or P2 findings, 2 when it could not run.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const top = git('rev-parse', '--show-toplevel');
const common = resolve(git('rev-parse', '--git-common-dir'));
const baseAt = process.argv.indexOf('--base');
const base = baseAt > 0 ? (process.argv[baseAt + 1] ?? 'origin/main') : 'origin/main';
const branch = git('branch', '--show-current') || 'detached';
const head = git('rev-parse', '--short', 'HEAD');

if (git('status', '--porcelain')) {
  console.error('review: commit your work first; the review reads the commits on this branch, not the working tree');
  process.exit(2);
}
const stat = git('diff', '--stat', `${base}...HEAD`);
if (!stat) {
  console.log(`review: no changes between ${base} and HEAD`);
  process.exit(0);
}
const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' });
if (codex.error) {
  console.error('review: the codex command is not installed or not on PATH');
  process.exit(2);
}

const dir = join(common, 'private', 'reviews');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const report = join(dir, `${branch.replace(/[^\w.-]/g, '_')}-${head}-${stamp}.md`);
const verdict = `${report}.last.md`;

const prompt = `You are a hostile code reviewer for this repository, a browser strategy game in TypeScript (pure engine
under src/engine, AI under src/ai, DOM and canvas UI under src/ui, bootstrapping under src/app; tests under test/).
Review the changes on this branch against ${base} (run: git diff ${base}...HEAD, and git log ${base}..HEAD for
the intent). Read as much surrounding code as you need to judge them: callers, the action pipeline in
src/engine/actions.ts, invariants in src/engine/invariants.ts, the rules in docs/RULES.md, and the tests.
Do not run the test suites or edit files; reason from the code. Look for:
- behaviour that is wrong for some input or state (crashes, thrown errors instead of validation failures,
  data loss, impurity in src/engine or src/ai, non-determinism, save-format breaks);
- edge cases the change does not handle that its callers can reach;
- tests that do not prove what their names claim, or that pass for the wrong reason;
- departures from docs/RULES.md or docs/FIDELITY.md that the change does not record;
- rule numbers written inline instead of in src/engine/data.
Ignore style, naming and formatting. Do not report hypothetical problems you cannot tie to a concrete
input or state.

Answer in exactly this form and nothing else after it:

## Verdict: CLEAN
or
## Verdict: FINDINGS

### Findings
- [P1] path/to/file.ts:LINE — one-line claim. Scenario: the input or state that triggers it and what goes wrong. Fix: the smallest change that would resolve it.
- [P2] ...
- [P3] ...
(P1: wrong behaviour, crash or data loss on a reachable path. P2: a reachable edge case, or a test that does
not prove its claim. P3: minor. Omit the section when the verdict is CLEAN.)

### Checked
- one line per area you inspected and found sound`;

console.log(`review: ${branch} (${head}) against ${base}; files:\n${stat}\n`);
const run = spawnSync('codex', ['exec', '--sandbox', 'read-only', '--cd', top, '--color', 'never', '--output-last-message', verdict, prompt], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  timeout: 20 * 60 * 1000,
});
writeFileSync(report, `# Review of ${branch} (${head}) against ${base}\n\n${run.stdout ?? ''}\n\n## stderr\n\n${run.stderr ?? ''}\n`);
if (run.status !== 0) {
  console.error(`review: codex exited with ${run.status ?? run.signal}; full output in ${report}`);
  process.exit(2);
}
let last = '';
try {
  last = readFileSync(verdict, 'utf8').trim();
} catch {
  console.error(`review: codex wrote no final message; full output in ${report}`);
  process.exit(2);
}
console.log(last);
console.log(`\nreview: full report in ${report}`);
const findings = (last.match(/^- \[(P[123])\]/gm) ?? []).map((line) => line.slice(3, 5));
const blocking = findings.filter((p) => p !== 'P3').length;
if (/^## Verdict: CLEAN/m.test(last) && blocking === 0) {
  console.log('review: CLEAN');
  process.exit(0);
}
console.log(`review: ${blocking} finding(s) at P1/P2 to fix (${findings.length} in all)`);
process.exit(1);
