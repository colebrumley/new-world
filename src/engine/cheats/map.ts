// Map cheats (R-1058; docs/RULES.md "Cheats"): lifting the fog, for the whole map or around one
// square. The squares become known to the power as squares a unit of its own had seen.
import type { CheatCommand, CheatSpec } from '../cheats';
import { CHEATS } from '../data/cheats';
import { revealAround } from '../explore';
import type { GameState, Player } from '../state';
import { CHEAT_OK, isCount, numberArg, onMap, refuse, squareArg, type CheatCheck, type CheatOutcome, type CheatSink } from './shared';

export type MapCommand =
  /** Make squares known to the power: all of them (`at` null), or those within `radius` of a square. */
  { readonly cheat: 'reveal'; readonly at: { readonly x: number; readonly y: number } | null; readonly radius: number };

/** May this power have this cheat? Null when the command is not one of this group's. */
export function checkMap(state: GameState, _player: Player, command: CheatCommand): CheatCheck | null {
  switch (command.cheat) {
    case 'reveal':
      if (command.at === null) return CHEAT_OK;
      if (typeof command.at !== 'object') return refuse('cheatSquare', 'reveal takes a square, or none for the whole map');
      if (!onMap(state, command.at.x, command.at.y)) return refuse('cheatSquare', `there is no square ${command.at.x},${command.at.y} on the map`);
      return isCount(command.radius) ? CHEAT_OK : refuse('cheatAmount', 'a radius is a whole number of zero or more');
    default:
      return null;
  }
}

/** Apply a checked cheat of this group. Null when the command is not one of this group's. */
export function applyMap(state: GameState, player: Player, command: CheatCommand, _events: CheatSink): CheatOutcome | null {
  switch (command.cheat) {
    case 'reveal': {
      const index = state.players.findIndex((p) => p.id === player.id);
      if (command.at === null) {
        // a radius as long as the map is, from its corner, takes in every square
        const reach = Math.max(state.map.width, state.map.height);
        return { state: { ...state, map: revealAround(state.map, index, 0, 0, reach).map }, summary: 'Revealed the whole map.' };
      }
      const { x, y } = command.at;
      const squares = command.radius === 1 ? 'square' : 'squares';
      return { state: { ...state, map: revealAround(state.map, index, x, y, command.radius).map }, summary: `Revealed the country within ${command.radius} ${squares} of ${x},${y}.` };
    }
    default:
      return null;
  }
}

export const MAP_SPECS: readonly CheatSpec[] = [
  {
    name: 'reveal',
    args: [{ name: 'square', kind: 'square', optional: true }, { name: 'radius', kind: 'count', optional: true }],
    about: `Makes the whole map known, or with a square the country around it (${CHEATS.revealRadius} squares each way if no radius is given).`,
    example: 'reveal 20,30 5',
    build: (args) => ({ cheat: 'reveal', at: squareArg(args, 'square') ?? null, radius: numberArg(args, 'radius') ?? CHEATS.revealRadius }),
  },
];
