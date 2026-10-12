// The cheat console (R-1062; docs/RULES.md "Cheats"): one typed line at a time, a transcript of what
// was done above it and a help sheet of every cheat. It knows no single cheat: the line is read by
// `cheat-parser.ts` against CHEAT_SPECS, checked by the engine, and handed to the game to apply.
// It stays open so that several lines can be run one after another.
import { validateAction, type Action } from '../engine/actions';
import type { GameState } from '../engine/state';
import { cheatHelp, completeCheat, parseCheat, withCompletion, type CheatContext } from './cheat-parser';

/** What the console needs of the game behind it. Each is asked afresh for every line: a cheat changes the answers. */
export interface CheatConsoleGame {
  readonly state: () => GameState;
  /** Who is at the console, the active unit and the square it stands on. */
  readonly context: () => CheatContext;
  /** Apply a `cheat` action the engine has accepted; the summary of what it did, or null if it did nothing. */
  readonly run: (action: Action) => string | null;
}

const HINT = 'Enter runs the line. Tab finishes a word. Up and Down bring back earlier lines.';

/** Show the console over `host`. Resolves when it is closed (Esc, or Done). */
export function showCheatConsole(host: HTMLElement, game: CheatConsoleGame): Promise<void> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const root = document.createElement('section');
    root.className = 'dialog cheat-console';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Cheats');
    const heading = document.createElement('h2');
    heading.textContent = 'Cheats';

    const transcript = document.createElement('ol');
    transcript.className = 'cheat-transcript';
    transcript.setAttribute('role', 'log');
    transcript.setAttribute('aria-label', 'What was done');

    const help = document.createElement('details');
    help.className = 'cheat-help';
    const summary = document.createElement('summary');
    summary.textContent = 'Commands';
    const sheet = document.createElement('div');
    sheet.className = 'cheat-sheet';
    sheet.tabIndex = 0; // a long sheet scrolls, and the keys must be able to scroll it
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const title of ['Command', 'What it does', 'Example']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = title;
      head.append(th);
    }
    const body = table.createTBody();
    for (const entry of cheatHelp()) {
      const row = body.insertRow();
      const usage = document.createElement('th');
      usage.scope = 'row';
      usage.textContent = entry.usage;
      row.append(usage);
      row.insertCell().textContent = entry.about;
      const example = row.insertCell();
      example.className = 'cheat-example';
      example.textContent = entry.example;
    }
    const grammar = document.createElement('p');
    grammar.textContent = 'An amount is 500 or +500 to add, -200 to take, =1000 to set. A square is x,y, or here for the active unit\'s. A thing is named by its id or by the start of its name; a name with spaces goes in "quotes". Put "as" and a power before a command to do it for that power.';
    sheet.append(table, grammar);
    help.append(summary, sheet);

    const label = document.createElement('label');
    label.className = 'cheat-line';
    label.textContent = 'Command';
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.maxLength = 200;
    label.append(input);

    const hint = document.createElement('p');
    hint.className = 'cheat-hint';
    hint.setAttribute('role', 'status');
    hint.textContent = HINT;
    const tell = (text: string, refused = false): void => {
      hint.textContent = text;
      hint.classList.toggle('refused', refused);
    };

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'options-done';
    done.textContent = 'Done (Esc)';

    /** The lines accepted this visit, oldest first; `at` is the one shown, or their count while a new line is typed. */
    const accepted: string[] = [];
    let at = 0;
    let draft = '';
    const show = (text: string): void => {
      input.value = text;
      input.setSelectionRange(text.length, text.length);
    };

    const run = (): void => {
      const text = input.value.trim();
      if (text === '') return tell(HINT);
      const parsed = parseCheat(text, game.state(), game.context());
      if (!parsed.ok) return tell(parsed.message, true);
      const check = validateAction(game.state(), parsed.action);
      if (!check.ok) return tell(check.error.message, true);
      const did = game.run(parsed.action);
      if (did === null) return tell('Nothing was done.', true);
      const item = document.createElement('li');
      const line = document.createElement('span');
      line.className = 'cheat-typed';
      line.textContent = text;
      item.append(line, ` ${did}`);
      transcript.append(item);
      transcript.scrollTop = transcript.scrollHeight;
      if (accepted[accepted.length - 1] !== text) accepted.push(text);
      at = accepted.length;
      draft = '';
      show('');
      tell(HINT);
    };

    /** Tab: finish the last word if only one word could, and say which could if several. False if there is nothing to finish. */
    const complete = (): boolean => {
      // completion reads the line up to the caret only when the caret is at its end: a word in the middle is left alone
      if (input.value.trim() === '' || input.selectionStart !== input.value.length) return false;
      const words = completeCheat(input.value, game.state(), game.context());
      if (words.length === 1) {
        show(withCompletion(input.value, words[0] as string));
        tell(HINT);
      } else if (words.length > 1) tell(words.join('  '));
      else tell('Nothing known begins that way.', true);
      return true;
    };

    const walk = (step: -1 | 1): void => {
      const next = Math.min(accepted.length, Math.max(0, at + step));
      if (next === at) return;
      if (at === accepted.length) draft = input.value;
      at = next;
      show(at === accepted.length ? draft : (accepted[at] as string));
    };

    const finish = (): void => {
      backdrop.remove();
      previous?.focus();
      resolve();
    };
    done.addEventListener('click', finish);
    input.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Enter') run();
      else if (event.key === 'ArrowUp') walk(-1);
      else if (event.key === 'ArrowDown') walk(1);
      // Shift+Tab, and Tab on an empty line, go on to the next control as Tab does anywhere
      else if (event.key !== 'Tab' || event.shiftKey || !complete()) return;
      event.preventDefault();
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && event.target === done)) {
        event.preventDefault();
        finish();
      }
      // no key typed here is an order on the map behind
      event.stopPropagation();
    });

    root.append(heading, transcript, help, label, hint, done);
    backdrop.append(root);
    host.append(backdrop);
    input.focus();
  });
}
