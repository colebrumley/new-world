// Cheats (R-1058; docs/RULES.md "Cheats"). A cheat is an ordinary action, logged and replayed like
// any other; this module holds the grammar's types, the list of every cheat's spec, and the check
// and the application, which hand each command to the group it belongs to (files under cheats/)
// and mark the powers concerned. Adding a cheat is one member of a group's command union, one case
// in that group's check and apply, and one spec in its list; nothing here or in the parser changes.
import { applyMap, checkMap, MAP_SPECS, type MapCommand } from './cheats/map';
import { refuse, type CheatCheck, type CheatOutcome, type CheatSideEvent } from './cheats/shared';
import { applyTreasury, checkTreasury, TREASURY_SPECS, type TreasuryCommand } from './cheats/treasury';
import type { ColonyId, GameState, Player, PlayerId } from './state';

export type { CheatCheck, CheatErrorCode } from './cheats/shared';

/** One member per cheat, told apart by `cheat`. Each group's file defines its own. */
export type CheatCommand =
  | TreasuryCommand
  // map and units (R-1059)
  // colonies and world (R-1060)
  | MapCommand;

export type CheatArgKind =
  | 'amount' | 'count' | 'percent' | 'square' | 'place'
  | 'colony' | 'unit' | 'good' | 'unitType' | 'profession' | 'father' | 'building'
  | 'tribe' | 'settlement' | 'power' | 'terrain' | 'resource'
  | { readonly oneOf: readonly string[] }          // one fixed word
  | { readonly anyOf: readonly CheatArgKind[] };   // the first alternative that matches
export interface CheatArg { readonly name: string; readonly kind: CheatArgKind; readonly optional?: boolean }
export type Place = { readonly kind: 'square'; readonly x: number; readonly y: number } | { readonly kind: 'colony'; readonly colonyId: ColonyId } | { readonly kind: 'europe' };
export type CheatArgValue =
  | number                                               // count, percent
  | string                                               // an id, or the word of a oneOf
  | { readonly set: boolean; readonly value: number }    // amount
  | { readonly x: number; readonly y: number }           // square
  | Place
  | { readonly kind: string; readonly value: CheatArgValue }; // anyOf: which alternative matched ('word' for a oneOf) and its value
export interface CheatSpec {
  readonly name: string; readonly args: readonly CheatArg[]; readonly about: string; readonly example: string;
  readonly build: (args: Readonly<Record<string, CheatArgValue | undefined>>) => CheatCommand;
}

/** The cheat was applied; `summary` says what it did, figures in plain digits. */
export type CheatAppliedEvent = { readonly type: 'cheatApplied'; readonly player: PlayerId; readonly summary: string };
export type CheatEvent = CheatAppliedEvent | CheatSideEvent;

/** Every cheat there is, in the order the help sheet lists them. */
export const CHEAT_SPECS: readonly CheatSpec[] = [
  ...TREASURY_SPECS,
  ...MAP_SPECS,
  // map and units (R-1059)
  // colonies and world (R-1060)
];

/** The power a cheat may be for: one of the European powers still in the New World, never the Crown's army. */
function powerFor(state: GameState, playerId: PlayerId): Player | null {
  const player = state.players.find((p) => p.id === playerId);
  return player && !player.withdrawn && player.id !== state.crownPlayer ? player : null;
}

/** May this cheat be applied for this power, as things stand? */
export function checkCheat(state: GameState, playerId: PlayerId, command: CheatCommand): CheatCheck {
  const player = powerFor(state, playerId);
  if (!player) return refuse('cheatPower', `"${String(playerId)}" is not a power in the New World`);
  if (typeof command !== 'object' || command === null) return refuse('cheatUnknown', 'that is no cheat');
  return (
    checkTreasury(state, player, command)
    ?? checkMap(state, player, command)
    // map and units (R-1059)
    // colonies and world (R-1060)
    ?? refuse('cheatUnknown', `there is no cheat "${String((command as { cheat?: unknown }).cheat)}"`)
  );
}

/**
 * Apply a cheat that checkCheat has passed. The power it was for and the power whose turn it is are
 * both marked for good, so that a cheat for another power cannot help the one at the table unmarked.
 * The first event pushed is `cheatApplied`; whatever the game's own code reported on the way follows.
 */
export function applyCheat(state: GameState, playerId: PlayerId, command: CheatCommand, events: { push(...events: CheatEvent[]): unknown }): GameState {
  const player = powerFor(state, playerId) as Player;
  const side: CheatSideEvent[] = [];
  const done: CheatOutcome | null =
    applyTreasury(state, player, command, side)
    ?? applyMap(state, player, command, side)
    // map and units (R-1059)
    // colonies and world (R-1060)
    ?? null;
  if (!done) return state;
  events.push({ type: 'cheatApplied', player: playerId, summary: done.summary }, ...side);
  const turn = done.state.players[done.state.current]?.id;
  const marked = done.state.players.map((p) => ((p.id === playerId || p.id === turn) && !p.cheated ? { ...p, cheated: true as const } : p));
  return { ...done.state, players: marked };
}
