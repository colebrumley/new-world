// Exploration and fog (R-104). A tile, once seen by a player, stays known for the whole game.
import { SIGHT } from './data/sight';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { tileIndex, type GameMap, type GameState, type Unit } from './state';
import { isExploredBy, markExplored, type Tile } from './tile';

export function sightRadius(unitType: UnitTypeId, hasDeSoto: boolean): number {
  return UNIT_TYPES[unitType].sight + (hasDeSoto ? SIGHT.deSotoBonus : 0);
}

/** Mark every tile within `radius` of (x, y) as seen by the player. Returns the map and the newly seen tile indices. */
export function revealAround(map: GameMap, playerIndex: number, x: number, y: number, radius: number): { map: GameMap; revealed: number[] } {
  const revealed: number[] = [];
  let tiles: Tile[] | null = null;
  for (let ty = Math.max(0, y - radius); ty <= Math.min(map.height - 1, y + radius); ty++) {
    for (let tx = Math.max(0, x - radius); tx <= Math.min(map.width - 1, x + radius); tx++) {
      const i = tileIndex(map, tx, ty);
      const tile = map.tiles[i] as Tile;
      if (isExploredBy(tile, playerIndex)) continue;
      tiles ??= [...map.tiles];
      tiles[i] = markExplored(tile, playerIndex);
      revealed.push(i);
    }
  }
  return tiles ? { map: { ...map, tiles }, revealed } : { map, revealed };
}

/** Natives and AI powers know the whole map; a human knows only what was explored. */
export function knowsTile(state: GameState, playerIndex: number, x: number, y: number): boolean {
  const player = state.players[playerIndex];
  if (!player || x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return false;
  if (player.kind === 'ai') return true;
  return isExploredBy(state.map.tiles[tileIndex(state.map, x, y)] as Tile, playerIndex);
}

/** The player's own units, plus foreign units standing next to one of them. */
export function visibleUnits(state: GameState, playerIndex: number): Unit[] {
  const player = state.players[playerIndex];
  if (!player) return [];
  const all = Object.values(state.units);
  const own = all.filter((u) => u.owner === player.id);
  const near = (u: Unit): boolean =>
    own.some((o) => Math.max(Math.abs(o.x - u.x), Math.abs(o.y - u.y)) <= SIGHT.foreignUnitRange);
  return all.filter((u) => u.owner === player.id || near(u));
}
