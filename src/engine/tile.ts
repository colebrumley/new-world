// Tile model (R-101). One plain object per map square.
import { FORESTED_FROM, TERRAIN, type OpenTerrain, type TerrainDef, type TerrainId } from './data/terrain';
import type { ResourceId } from './data/resources';

/** The ground itself. Forest and relief are separate overlays on top of it. */
export type BaseTerrain = OpenTerrain | 'arctic' | 'ocean' | 'seaLane';
export type Relief = 'flat' | 'hills' | 'mountains';
export type River = 'none' | 'minor' | 'major';

export interface Tile {
  readonly base: BaseTerrain;
  /** Only meaningful on the 8 open land types. */
  readonly forest: boolean;
  readonly relief: Relief;
  readonly river: River;
  readonly road: boolean;
  readonly plowed: boolean;
  readonly resource: ResourceId | null;
  /** A Lost City Rumor waits here. */
  readonly rumor: boolean;
  /** Tribe whose homeland this is, by tribe id. */
  readonly homeland: string | null;
  /** European player who owns this land (bought, taken, or inside a colony radius). */
  readonly claim: string | null;
  /** Bit i is set once the player at index i in state.players has seen this tile. */
  readonly explored: number;
}

export const OCEAN_TILE: Tile = {
  base: 'ocean', forest: false, relief: 'flat', river: 'none', road: false, plowed: false,
  resource: null, rumor: false, homeland: null, claim: null, explored: 0,
};

export function makeTile(patch: Partial<Tile> = {}): Tile {
  return { ...OCEAN_TILE, ...patch };
}

const OPEN = new Set<string>(Object.keys(FORESTED_FROM));

export function isOpenBase(base: BaseTerrain): base is OpenTerrain {
  return OPEN.has(base);
}

export function isWater(tile: Tile): boolean {
  return tile.base === 'ocean' || tile.base === 'seaLane';
}

export function isLand(tile: Tile): boolean {
  return !isWater(tile);
}

/** Row of the terrain table that governs this tile: relief wins, then forest, then the base. */
export function terrainOf(tile: Tile): TerrainId {
  if (isWater(tile)) return tile.base;
  if (tile.relief === 'mountains') return 'mountains';
  if (tile.relief === 'hills') return 'hills';
  if (tile.forest && isOpenBase(tile.base)) return FORESTED_FROM[tile.base];
  return tile.base;
}

export function terrainDef(tile: Tile): TerrainDef {
  return TERRAIN[terrainOf(tile)];
}

export function hasForest(tile: Tile): boolean {
  return tile.forest && tile.relief === 'flat' && isOpenBase(tile.base);
}

export function isExploredBy(tile: Tile, playerIndex: number): boolean {
  return (tile.explored & (1 << playerIndex)) !== 0;
}

export function markExplored(tile: Tile, playerIndex: number): Tile {
  const bit = 1 << playerIndex;
  return tile.explored & bit ? tile : { ...tile, explored: tile.explored | bit };
}
