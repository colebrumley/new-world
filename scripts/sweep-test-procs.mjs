// Ends what a killed test run leaves behind: Playwright workers, their headless browsers and the
// preview servers started for them, when the run that owned them is gone. Lists them by default;
// `--kill` (what `npm run sweep` passes) ends them. Also clears builds left by dead runs.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const kill = process.argv.includes('--kill');

const rows = execFileSync('ps', ['-x', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
  .filter(Boolean)
  .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }));
const byPid = new Map(rows.map((row) => [row.pid, row]));

const isRunner = (c) => /playwright(\/cli\.js)? test\b|[/ ]playwright test\b/.test(c);
const isWorker = (c) => c.includes('playwright/lib/worker/workerProcessEntry');
const isBrowser = (c) => c.includes('ms-playwright') && !c.includes('--type=');
const isPreview = (c) => /vite(\.js)? preview\b.*--strictPort/.test(c);
/** The wrappers a preview server is started through. */
const isWrapper = (c) => /^(npm |sh -c |\/bin\/sh -c |node \S*npm-cli\.js |node \S*\/npx-cli\.js )/.test(c);

/**
 * True when no living test run stands above the process: its line of parents reaches init through
 * wrappers alone. A shell, a terminal or anything else above it means somebody still owns it.
 */
function orphaned(row) {
  for (let at = byPid.get(row.ppid), guard = 0; guard < 32; at = byPid.get(at.ppid), guard++) {
    if (!at || at.pid === 1) return true;
    if (isRunner(at.command) || isWorker(at.command) || !isWrapper(at.command)) return false;
  }
  return false;
}

const found = rows.filter((row) => (isWorker(row.command) || isBrowser(row.command) || isPreview(row.command)) && orphaned(row));
const doomed = new Set(found.map((row) => row.pid));
// everything under them goes too
for (let grew = true; grew; ) {
  grew = false;
  for (const row of rows) if (doomed.has(row.ppid) && !doomed.has(row.pid)) grew = doomed.add(row.pid) && true;
}

for (const row of found) console.log(`${kill ? 'ending' : 'left behind'}: ${row.pid} ${row.command.slice(0, 110)}`);
if (kill) {
  for (const pid of doomed) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

// builds whose port nobody is serving any more
const cache = 'node_modules/.cache/new-world-e2e';
const ports = existsSync(cache) ? readdirSync(cache) : [];
const serving = (port) => rows.some((row) => !doomed.has(row.pid) && row.command.includes(`${cache}/${port}`));
const stale = ports.filter((port) => !serving(port));
for (const port of stale) {
  console.log(`${kill ? 'removing' : 'stale build'}: ${join(cache, port)}`);
  if (kill) rmSync(join(cache, port), { recursive: true, force: true });
}

if (found.length === 0 && stale.length === 0) console.log('nothing left behind');
else if (!kill) console.log('run `npm run sweep` to end them');
