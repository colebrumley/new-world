// Native settlements (R-501): the record, who owns which land, and small look-ups.
// Placement is in mapgen/settlements.ts; what happens in and around them is R-502 onward.
import { TRIBES, type TribeId } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import type { GameMap, GameState, Settlement } from './state';
import { isWater, type Tile } from './tile';

/** The natives' measure of distance: the longer offset plus half the shorter. */
export function nativeDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.min(dx, dy) >> 1);
}

export function settlementAt(state: Pick<GameState, 'settlements'>, x: number, y: number): Settlement | null {
  for (const s of Object.values(state.settlements)) if (s.x === x && s.y === y) return s;
  return null;
}

export function settlementsOf(state: Pick<GameState, 'settlements'>, tribe: TribeId): Settlement[] {
  return Object.values(state.settlements).filter((s) => s.tribe === tribe);
}

export function capitalOf(state: Pick<GameState, 'settlements'>, tribe: TribeId): Settlement | null {
  return settlementsOf(state, tribe).find((s) => s.capital) ?? null;
}

/** The settlement whose land a tile is: the nearest one, if the tile lies within that settlement's reach. */
export function landOwner(settlements: readonly Settlement[], x: number, y: number): Settlement | null {
  let best: Settlement | null = null;
  let bestD = Infinity;
  for (const s of settlements) {
    const d = nativeDistance(s.x, s.y, x, y);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best && bestD <= TRIBES[best.tribe].landRadius ? best : null;
}

/** Write each land tile's tribe into the map (a cache of `landOwner`; redo it when settlements change). */
export function markHomelands(map: GameMap, settlements: readonly Settlement[]): GameMap {
  const reach = Math.max(0, ...settlements.map((s) => TRIBES[s.tribe].landRadius));
  const touched = new Set<number>();
  for (const s of settlements) {
    for (let y = s.y - reach; y <= s.y + reach; y++) {
      for (let x = s.x - reach; x <= s.x + reach; x++) {
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) touched.add(y * map.width + x);
      }
    }
  }
  let changed = false;
  const tiles = map.tiles.map((tile, i) => {
    const owner = touched.has(i) && !isWater(tile) ? landOwner(settlements, i % map.width, Math.floor(i / map.width)) : null;
    const homeland = owner ? owner.tribe : null;
    if (tile.homeland === homeland) return tile;
    changed = true;
    return { ...tile, homeland };
  });
  return changed ? { ...map, tiles } : map;
}

/**
 * Does this power have to reckon with a tribe before using the tile? Not if the land is nobody's,
 * already bought or taken (claimed), the tribe has not yet met the power, or the power has Minuit.
 */
export function isNativeLand(state: Pick<GameState, 'tribes' | 'players'>, tile: Tile, playerId: string | null): boolean {
  if (tile.homeland === null || playerId === null || tile.claim === playerId) return false;
  const tribe = state.tribes[tile.homeland as TribeId];
  if (!tribe || !tribe.met.includes(playerId)) return false;
  return !state.players.find((p) => p.id === playerId)?.fathers.includes('peterMinuit');
}

/** Fighting weight of a tribe: its settlements stand in for their braves until braves are units (R-507). */
export function tribeMight(state: GameState, tribe: TribeId): number {
  const braves = Object.values(state.units).filter((u) => u.owner === `tribe:${tribe}`).reduce((n, u) => n + Math.max(1, UNIT_TYPES[u.type].attack), 0);
  return Math.min(255, braves > 0 ? braves : Object.values(state.settlements).filter((s) => s.tribe === tribe).length);
}

// --- braves ------------------------------------------------------------------------------------------

/** Native units belong to their tribe, not to a player: the owner is written like this. */
export const tribeOwner = (tribe: TribeId): string => `tribe:${tribe}`;
export function tribeOfOwner(owner: string): TribeId | null {
  const name = owner.startsWith('tribe:') ? owner.slice(6) : '';
  return name in TRIBES ? (name as TribeId) : null;
}
/** Each settlement has one brave at most, named after it. */
export const braveId = (settlementId: string): string => `brave-${settlementId}`;
export const homeOfBrave = (state: Pick<GameState, 'settlements'>, unitId: string): Settlement | null =>
  unitId.startsWith('brave-') ? (state.settlements[unitId.slice(6)] ?? null) : null;

