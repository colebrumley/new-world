// Saved games (R-1005): ten slots in the browser. The first eight are the player's; the ninth
// keeps a copy from the start of each decade and the tenth is the game as it stands (the
// autosave, written as play goes on). A game can also leave and enter the browser as a .json file.
import { dateOfTurn, formatDate } from '../engine/calendar';
import { NATIONS } from '../engine/data/nations';
import { DIFFICULTY_NAMES } from '../engine/difficulty';
import { loadGame, saveGame, SaveFormatError, type GameSession } from '../engine/save';
import { DECADE_SLOT, LAST_TURN_SLOT, SLOT_COUNT, slotKey } from './save-keys';

export { DECADE_SLOT, LAST_TURN_SLOT, SLOT_COUNT };

export interface SlotInfo {
  readonly index: number;
  /** "Slot 3", "Autosave (decade)", "Autosave (last turn)". */
  readonly label: string;
  /** What is in it, or null when it is empty. */
  readonly summary: string | null;
  /** The player may save into it; the autosave slots are written by the game. */
  readonly writable: boolean;
  /** A reason it cannot be loaded, if its contents are unreadable. */
  readonly problem: string | null;
}

const slotLabel = (index: number): string => (index === LAST_TURN_SLOT ? 'Autosave (last turn)' : index === DECADE_SLOT ? 'Autosave (decade)' : `Slot ${index + 1}`);

/** One line saying what a saved game is: who, when, how hard, how large. */
export function describeSession(session: GameSession): string {
  const state = session.state;
  const player = state.players.find((p) => p.kind === 'human') ?? state.players[0];
  const colonies = player ? Object.values(state.colonies).filter((c) => c.owner === player.id).length : 0;
  const who = player ? `${NATIONS[player.nation].leader} of ${NATIONS[player.nation].name}` : 'Nobody';
  return `${who}, ${formatDate(dateOfTurn(state.turn))}, ${DIFFICULTY_NAMES[state.difficulty]}, ${colonies} ${colonies === 1 ? 'colony' : 'colonies'}`;
}

/** Why a save would not load, in words for the player. */
export function describeLoadError(error: unknown): string {
  if (!(error instanceof SaveFormatError)) return 'That saved game could not be read.';
  switch (error.code) {
    case 'newer': return 'That game was saved by a newer version of New World than this one.';
    case 'obsolete': return 'That saved game is obsolete: it comes from a version too old to be read.';
    case 'mapSize': return 'That saved game is damaged: its map is not the size it says it is.';
    case 'incomplete': return 'That saved game is incomplete.';
    case 'notSave': return 'That is not a New World saved game.';
  }
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function listSlots(): SlotInfo[] {
  return Array.from({ length: SLOT_COUNT }, (_, index): SlotInfo => {
    const text = read(slotKey(index));
    const base = { index, label: slotLabel(index), writable: index < DECADE_SLOT };
    if (text === null) return { ...base, summary: null, problem: null };
    try {
      return { ...base, summary: describeSession(loadGame(text)), problem: null };
    } catch (error) {
      return { ...base, summary: 'Unreadable', problem: describeLoadError(error) };
    }
  });
}

/** Save into a slot. False if the browser would not keep it. */
export function writeSlot(index: number, session: GameSession): boolean {
  try {
    localStorage.setItem(slotKey(index), saveGame(session));
    return true;
  } catch {
    return false;
  }
}

/** The game in a slot. Throws SaveFormatError if it cannot be read; null if the slot is empty. */
export function readSlot(index: number): GameSession | null {
  const text = read(slotKey(index));
  return text === null ? null : loadGame(text);
}

/** Keep a copy as each decade opens: on the first turn of a year ending in nought. */
export function keepDecade(session: GameSession): boolean {
  const { year, season } = dateOfTurn(session.state.turn);
  if (year % 10 !== 0 || season === 'autumn') return false;
  return writeSlot(DECADE_SLOT, session);
}

/** A name for the exported file. */
export function exportName(session: GameSession): string {
  const { year } = dateOfTurn(session.state.turn);
  const player = session.state.players.find((p) => p.kind === 'human') ?? session.state.players[0];
  return `new-world-${player ? player.nation : 'game'}-${year}.json`;
}
