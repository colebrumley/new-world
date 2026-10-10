// Refuses, before it runs, a shell command that would break a rule every session is under:
//   - code changes, branch switches and test suites happen in a worktree, never in the main checkout;
//   - nothing that is about to become public (a commit, a push, a pull request) may match the
//     private word list, which lives in the shared git directory and is never tracked.
// Registered as a PreToolUse hook on Bash in .claude/settings.json; the hook's JSON arrives on stdin.
//   node scripts/guard.mjs             as the hook
//   npm run guard                      by hand: scan this branch against origin/main and its log
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const git = (cwd, ...args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
};
const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
const toplevel = (cwd) => real(git(cwd, 'rev-parse', '--show-toplevel'));
const commonDir = (cwd) => {
  const dir = git(cwd, 'rev-parse', '--git-common-dir');
  return dir ? real(resolve(cwd, dir)) : '';
};
const wordsFile = (cwd) => process.env['GUARD_WORDS'] ?? join(commonDir(cwd), 'private', 'banned-words.txt');

/** Commands that edit the tree or the branch, or run a suite: worktree only. */
const CHANGES_TREE = /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|checkout|switch|stash|merge|rebase|reset|cherry-pick|revert|am|apply|pull|restore|rm|mv|add)\b|\bnpm\s+(?:test\b|run\s+(?:check|test|test:e2e)\b)|\bnpx\s+(?:vitest|playwright)\b|\bplaywright\s+test\b/;
/** Commands after which text is public. */
const GOES_PUBLIC = /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push|tag|notes)\b|\bgh\s+(?:pr|issue|release|repo)\s+(?:create|edit|comment|review|merge|close|reopen)\b|\bgh\s+api\b.*(?:\s-[fF]\s|--field|--input|--method|\s-X\s)/;

const unquote = (m) => m?.[2] ?? m?.[3] ?? m?.[4];
const at = (cwd, target) => (isAbsolute(target) ? target : resolve(cwd, target.replace(/^~/, process.env['HOME'] ?? '~')));

/** Where the command will act: the hook's cwd, where a leading `cd` takes it, or git's `-C`. */
function effectiveDir(command, cwd) {
  const cd = /^\s*cd\s+("([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;)/.exec(command);
  const after = unquote(cd) ? at(cwd, unquote(cd)) : cwd;
  const dashC = /\bgit\s+-C\s+("([^"]+)"|'([^']+)'|(\S+))/.exec(command);
  return unquote(dashC) ? at(after, unquote(dashC)) : after;
}

/** Files the command reads a message or body from: commit -F, gh --body-file and the like. */
function messageFiles(command, cwd) {
  const files = [];
  const re = /(?:^|\s)(?:-F|--file|--body-file|--notes-file|--template)[=\s]+("([^"]+)"|'([^']+)'|(\S+))/g;
  for (let m = re.exec(command); m; m = re.exec(command)) files.push(at(cwd, unquote(m)));
  return files;
}

/** The patterns of the private list: one regular expression a line, `#` lines are comments. */
function patterns(cwd) {
  const file = wordsFile(cwd);
  if (!existsSync(file)) return { file, list: null };
  const list = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new RegExp(line, 'i'));
  return { file, list };
}

/**
 * Lines that are about to become public: the command, the files it reads a message from, what is
 * staged, what is in the tree, new files, and before a push or a pull request every commit not yet
 * on origin/main, message and patch alike (history is public too, so a line added and removed again
 * on the branch still counts).
 */
function publicText(command, dir, { againstBase }) {
  const sources = [];
  const added = (label, diff) => sources.push({ label, lines: diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')) });
  if (command) sources.push({ label: 'command', lines: command.split('\n') });
  for (const file of messageFiles(command, dir)) {
    try {
      sources.push({ label: `message file ${file}`, lines: readFileSync(file, 'utf8').split('\n') });
    } catch {
      // not there yet, or not a file
    }
  }
  added('staged changes', git(dir, 'diff', '--cached'));
  added('changes against HEAD', git(dir, 'diff', 'HEAD'));
  for (const path of git(dir, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
    const full = join(dir, path);
    try {
      if (statSync(full).size > 512 * 1024 || /\.(png|woff2?|ttf|zip|ico|jpe?g|gif)$/i.test(path)) continue;
      sources.push({ label: `new file ${path}`, lines: readFileSync(full, 'utf8').split('\n') });
    } catch {
      // unreadable: nothing to scan
    }
  }
  if (againstBase && git(dir, 'rev-parse', '--verify', '--quiet', 'origin/main')) {
    sources.push({ label: 'commit messages not on origin/main', lines: git(dir, 'log', 'origin/main..HEAD', '--format=%B').split('\n') });
    added('commits not on origin/main', git(dir, 'log', '-p', '--format=', 'origin/main..HEAD'));
  }
  return sources;
}

function matches(sources, list) {
  const hits = [];
  for (const { label, lines } of sources) {
    for (const line of lines) {
      const pattern = list.find((re) => re.test(line));
      if (pattern) hits.push(`${label}: ${line.trim().slice(0, 160)}   [${pattern.source}]`);
      if (hits.length >= 12) return hits;
    }
  }
  return hits;
}

const deny = (reason) => {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
};
const warn = (text) => {
  console.log(JSON.stringify({ systemMessage: text }));
  process.exit(0);
};

if (process.argv.includes('--check')) {
  const dir = toplevel(process.cwd());
  if (!dir) {
    console.error('guard: not in a git repository');
    process.exit(2);
  }
  const { file, list } = patterns(dir);
  if (!list) {
    console.error(`guard: no word list at ${file}; nothing checked`);
    process.exit(2);
  }
  const hits = matches(publicText('', dir, { againstBase: true }), list);
  for (const hit of hits) console.log(hit);
  console.log(hits.length === 0 ? 'guard: nothing on this branch matches the word list' : `guard: ${hits.length} line(s) match the word list; reword them before they go public`);
  process.exit(hits.length === 0 ? 0 : 1);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
try {
  const command = String(input?.tool_input?.command ?? '');
  const cwd = String(input?.cwd ?? process.cwd());
  if (!command) process.exit(0);
  const dir = effectiveDir(command, cwd);
  const top = toplevel(dir);
  if (!top) process.exit(0);

  if (CHANGES_TREE.test(command) && top === dirname(commonDir(dir))) {
    deny(
      `${top} is the main checkout. Code changes, branch switches, stashes and test suites happen in a worktree of your own under .claude/worktrees/ (CLAUDE.md, rule 1). ` +
        `If this session already has one, run the command from there; otherwise make one: git fetch origin && git worktree add .claude/worktrees/<name> -b <name> origin/main. ` +
        `The owner may run this from a terminal.`,
    );
  }

  if (GOES_PUBLIC.test(command)) {
    const { file, list } = patterns(dir);
    if (!list) warn(`guard: no word list at ${file}, so the public-repo word check did not run (see CLAUDE.md).`);
    const hits = matches(publicText(command, dir, { againstBase: /\bgit\s+(?:-C\s+\S+\s+)?push\b|\bgh\s/.test(command) }), list);
    if (hits.length > 0) {
      deny(`This would make text public that matches the private word list (CLAUDE.md, public-repo rule). Reword these, then try again:\n${hits.join('\n')}`);
    }
  }
} catch (error) {
  warn(`guard: could not check this command (${error instanceof Error ? error.message : String(error)}); it was allowed.`);
}
