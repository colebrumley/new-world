// The end page: what the player sees when the game is over, for whichever of the six reasons. A
// headline that says plainly whether it was a win, a loss or a retirement, the closing words, the
// date, the score with its rating and honour, and every way on from here. `endPageModel` is the
// page as plain data, read from the state; `openEndPage` lays it out as a sheet of parchment over
// the game and hands each choice back to whoever opened it (app/game-screen.ts).
import { validateAction } from '../engine/actions';
import { dateOfTurn, formatDate } from '../engine/calendar';
import type { GameOverReason, GameState } from '../engine/state';
import { drawSprite, sealArt } from './pixel-art';
import { reportHead } from './reports/heads';
import { scoreReport } from './reports/score';

/** What an ending is to the player; the page is inked by it. */
export type EndKind = 'win' | 'loss' | 'retirement';

export type EndChoice = 'reckoning' | 'playOn' | 'newGame' | 'loadGame' | 'lookOver';

export const END_KIND = {
  retiredEarly: 'retirement',
  retired: 'retirement',
  warLost: 'loss',
  independence: 'win',
  crownVictory: 'loss',
  noColonies: 'loss',
} as const satisfies Record<GameOverReason, EndKind>;

export const END_HEADLINE = {
  retiredEarly: 'Retirement: you lay down your office',
  retired: 'Retirement: your term is over',
  warLost: 'Defeat: the war is not won',
  independence: 'Victory: independence is won',
  crownVictory: 'Defeat: the rebellion is put down',
  noColonies: 'Defeat: your charter is withdrawn',
} as const satisfies Record<GameOverReason, string>;

export const END_TEXT = {
  retiredEarly: 'You have laid down the Viceroy\'s office. The colonies will be judged as they stand.',
  retired: 'The year is 1800 and your term as Viceroy is over. The colonies will be judged as they stand.',
  warLost: 'It is 1850 and the war is not won. The Congress makes its peace with the Crown.',
  independence: 'The King\'s army is broken and his colonies are ours. The Crown recognises our independence: a new nation is born.',
  crownVictory: 'The Crown has put down the rebellion. Our leaders go into exile, and the colonies return to the King.',
  noColonies: 'You hold no colony in the New World. The Crown has withdrawn your charter.',
} as const satisfies Record<GameOverReason, string>;

/** Said on the page of a game that may be played on. */
export const PLAY_ON_NOTE = 'The game has been scored. You may play on; it will not be scored again.';

export const END_CHOICE_LABELS = {
  reckoning: 'The reckoning',
  playOn: 'Play on',
  newGame: 'New game',
  loadGame: 'Load game',
  lookOver: 'Look over the map',
} as const satisfies Record<EndChoice, string>;

/** What the command bar's button, and the status line, call the way back to the page. */
export const END_BUTTON = 'The end';
export const END_STATUS = 'The game has ended. Press Enter for the end page.';

export interface EndPageModel {
  readonly reason: GameOverReason;
  readonly kind: EndKind;
  readonly headline: string;
  readonly text: string;
  /** A line under the text, where there is something more to say; else empty. */
  readonly note: string;
  /** When it ended, as the sidebar writes a date. */
  readonly date: string;
  readonly score: string;
  readonly rating: string;
  /** What posterity has named after the player, or that it has named nothing. */
  readonly honour: string;
  readonly choices: readonly EndChoice[];
}

/** The page for a game that is over; null for one still being played. */
export function endPageModel(state: GameState): EndPageModel | null {
  const over = state.over;
  if (!over) return null;
  // the score, the rating and the honour in the words of the score report
  const [score, rating] = scoreReport(state, over.player).sections;
  const canPlayOn = validateAction(state, { type: 'continuePlaying' }).ok;
  return {
    reason: over.reason,
    kind: END_KIND[over.reason],
    headline: END_HEADLINE[over.reason],
    text: END_TEXT[over.reason],
    note: canPlayOn ? PLAY_ON_NOTE : '',
    date: formatDate(dateOfTurn(state.turn)),
    score: score?.rows.at(-1)?.at(-1) ?? '',
    rating: rating?.rows[0]?.[1] ?? '',
    honour: rating?.rows[1]?.[0] ?? '',
    choices: ['reckoning', ...(canPlayOn ? ['playOn' as const] : []), 'newGame', 'loadGame', 'lookOver'],
  };
}

export interface EndPage {
  readonly element: HTMLElement;
  /** Take the page down. The focus is the caller's to place. */
  close(): void;
}

/** Screen pixels to one art pixel of the seal. */
const SEAL_SCALE = 3;
const HEADLINE_ID = 'end-page-headline';

/**
 * Put the page up over `host`, the first choice holding the keyboard. The arrow keys move among the
 * choices and Enter takes one, as in a dialog; Escape looks over the map. The page stays up until
 * it is closed: a choice that opens something over it (the reckoning, the load dialog) returns to it.
 */
export function openEndPage(host: HTMLElement, model: EndPageModel, onPick: (choice: EndChoice) => void): EndPage {
  const root = document.createElement('section');
  root.className = 'end-page';
  root.dataset['reason'] = model.reason;
  root.dataset['kind'] = model.kind;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', HEADLINE_ID);

  // the chronicler's seal, as on the score report
  const about = reportHead('score');
  const art = sealArt(about.glyph, about.wax);
  const seal = document.createElement('canvas');
  seal.className = 'end-seal';
  seal.width = art.size * SEAL_SCALE;
  seal.height = art.size * SEAL_SCALE;
  seal.setAttribute('aria-hidden', 'true');
  const ctx = seal.getContext('2d');
  if (ctx) drawSprite(ctx, art, 0, 0, seal.width);

  const headline = document.createElement('h2');
  headline.id = HEADLINE_ID;
  headline.className = 'end-headline';
  headline.textContent = model.headline;
  const text = document.createElement('p');
  text.className = 'end-text';
  text.textContent = model.text;
  root.append(seal, headline, text);
  if (model.note) {
    const note = document.createElement('p');
    note.className = 'end-note';
    note.textContent = model.note;
    root.append(note);
  }

  const tally = document.createElement('dl');
  tally.className = 'end-tally';
  for (const [name, value, field] of [['Ended', model.date, 'date'], ['Score', model.score, 'score'], ['Colonial Rating', model.rating, 'rating']] as const) {
    const pair = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = name;
    const dd = document.createElement('dd');
    dd.dataset['end'] = field;
    dd.textContent = value;
    pair.append(dt, dd);
    tally.append(pair);
  }
  const honour = document.createElement('p');
  honour.className = 'end-honour';
  honour.dataset['end'] = 'honour';
  honour.textContent = model.honour;
  root.append(tally, honour);

  const choices = document.createElement('div');
  choices.className = 'end-choices';
  const buttons = model.choices.map((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['choice'] = choice;
    button.textContent = END_CHOICE_LABELS[choice];
    button.addEventListener('click', () => onPick(choice));
    choices.append(button);
    return button;
  });
  root.append(choices);

  root.addEventListener('keydown', (event) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') buttons[(at + 1) % buttons.length]?.focus();
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') buttons[(at + buttons.length - 1) % buttons.length]?.focus();
    else if (event.key === 'Escape') onPick('lookOver');
    else if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Tab') event.preventDefault();
    event.stopPropagation();
  });

  host.append(root);
  buttons[0]?.focus();
  return { element: root, close: () => root.remove() };
}
