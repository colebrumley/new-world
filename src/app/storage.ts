// Persistence to localStorage. Failures (private mode, quota) never break play.
import { loadGame, saveGame, type GameSession } from '../engine/save';
import { parseOptions, serializeOptions, type Options } from '../ui/options';

import { AUTOSAVE_KEY } from './save-keys';

export function writeAutosave(session: GameSession): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, saveGame(session));
  } catch {
    // storage unavailable: play on without an autosave
  }
}

export function readAutosave(): GameSession | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text ? loadGame(text) : null;
  } catch {
    return null;
  }
}

export function hasAutosave(): boolean {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== null;
  } catch {
    return false;
  }
}

const OPTIONS_KEY = 'new-world:options';
/** Older builds kept this one option under its own key; it is still honoured when the options have never been saved. */
const LEGACY_ANALYSIS_KEY = 'new-world:combat-analysis';

export function readOptions(): Options {
  try {
    const text = localStorage.getItem(OPTIONS_KEY);
    const options = parseOptions(text);
    return text === null && localStorage.getItem(LEGACY_ANALYSIS_KEY) === 'off' ? { ...options, combatAnalysis: false } : options;
  } catch {
    return parseOptions(null);
  }
}

export function writeOptions(options: Options): void {
  try {
    localStorage.setItem(OPTIONS_KEY, serializeOptions(options));
  } catch {
    // storage unavailable: the choices last for this visit only
  }
}

const hintsKey = (seed: number | string): string => `new-world:hints:${String(seed)}`;

/** The hints already given in the game with this seed. */
export function readHintsSeen(seed: number | string): Set<number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(hintsKey(seed)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

export function writeHintsSeen(seed: number | string, seen: ReadonlySet<number>): void {
  try {
    localStorage.setItem(hintsKey(seed), JSON.stringify([...seen]));
  } catch {
    // storage unavailable: a hint may be given again another day
  }
}
