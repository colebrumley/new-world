// The board: what every session working on this repo can see, whichever worktree it is in.
// It lives in the repository's shared git directory, so it is common to all worktrees and is
// never committed. A claim says "this worktree is doing this requirement"; a note tells the
// others something they need to know.
//
//   npm run board                           who is doing what, and the latest notes
//   npm run board -- claim R-804 "words"    take a requirement; fails if another worktree has it
//   npm run board -- release R-804          give it up (when merged, blocked or abandoned)
//   npm run board -- note "words"           tell the others
//   npm run board -- log 50                 more of the notes
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const dir = process.env['BOARD_DIR'] ?? join(resolve(git('rev-parse', '--git-common-dir')), 'board');
const claims = join(dir, 'claims');
const log = join(dir, 'log.jsonl');
mkdirSync(claims, { recursive: true });

const me = { worktree: process.env['BOARD_WORKTREE'] ?? git('rev-parse', '--show-toplevel'), branch: git('branch', '--show-current') || 'detached' };
const [command = 'status', ...rest] = process.argv.slice(2).filter((arg) => arg !== '--force');
const force = process.argv.includes('--force');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const fileOf = (id) => (/^[\w.-]+$/.test(id ?? '') ? join(claims, `${id}.json`) : fail('name what you are claiming, as in R-804'));
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
/** A claim whose worktree is gone holds nothing. */
const stale = (claim) => !existsSync(claim.worktree);
const ago = (iso) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return minutes < 90 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`;
};
const say = (text) => appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), branch: me.branch, text })}\n`);
const notes = (count) => {
  const lines = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).slice(-count) : [];
  for (const line of lines) {
    const note = JSON.parse(line);
    console.log(`  ${ago(note.at).padEnd(11)} ${note.branch}: ${note.text}`);
  }
  if (lines.length === 0) console.log('  nothing yet');
};

if (command === 'claim') {
  const [id, ...words] = rest;
  const file = fileOf(id);
  // a claim made from the main checkout would never lapse, and would not be the claimant's to release
  if (!process.env['BOARD_WORKTREE'] && git('rev-parse', '--absolute-git-dir') === resolve(git('rev-parse', '--git-common-dir'))) fail('claim from a worktree of your own, not from the main checkout (see CLAUDE.md)');
  const mine = { id, ...me, what: words.join(' '), at: new Date().toISOString() };
  try {
    // creating the file is the claim: only one of two sessions asking at once can succeed
    writeFileSync(file, JSON.stringify(mine, null, 2), { flag: 'wx' });
  } catch {
    const held = read(file);
    if (held.worktree !== me.worktree && !stale(held) && !force) fail(`${id} is taken by ${held.branch} (${held.worktree}), ${ago(held.at)}${held.what ? `: ${held.what}` : ''}`);
    writeFileSync(file, JSON.stringify(mine, null, 2));
  }
  say(`claimed ${id}${mine.what ? `: ${mine.what}` : ''}`);
  console.log(`${id} is yours`);
} else if (command === 'release') {
  const [id, ...words] = rest;
  const file = fileOf(id);
  if (!existsSync(file)) fail(`${id} is not claimed`);
  const held = read(file);
  if (held.worktree !== me.worktree && !stale(held) && !force) fail(`${id} belongs to ${held.branch} (${held.worktree})`);
  rmSync(file);
  say(`released ${id}${words.length > 0 ? `: ${words.join(' ')}` : ''}`);
  console.log(`${id} released`);
} else if (command === 'note') {
  if (rest.length === 0) fail('say something, as in: npm run board -- note "main now has the new save format"');
  say(rest.join(' '));
} else if (command === 'log') {
  notes(Number(rest[0] ?? 50));
} else if (command === 'status') {
  const all = readdirSync(claims).filter((name) => name.endsWith('.json')).map((name) => read(join(claims, name)));
  console.log('Claims');
  for (const claim of all.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))) {
    const flag = stale(claim) ? ' [worktree gone: free to claim]' : claim.worktree === me.worktree ? ' [yours]' : '';
    console.log(`  ${claim.id.padEnd(8)} ${claim.branch}, ${ago(claim.at)}${flag}${claim.what ? `: ${claim.what}` : ''}`);
  }
  if (all.length === 0) console.log('  none');
  console.log('Notes');
  notes(15);
} else fail(`unknown command ${command}: use claim, release, note, log or nothing`);
