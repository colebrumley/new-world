// Terrain rule table, transcribed from NAMES.TXT @UNFORESTED / @FORESTED / @OTHER.
// Row format there: name, move cost, defense, improvement, AI value, then nine yields in the
// order food, sugar, tobacco, cotton, furs, lumber, ore, silver, fish.

export const RAW_GOODS = ['food', 'sugar', 'tobacco', 'cotton', 'furs', 'lumber', 'ore', 'silver', 'fish'] as const;
export type RawGood = (typeof RAW_GOODS)[number];

export const OPEN_TERRAINS = ['tundra', 'desert', 'plains', 'prairie', 'grassland', 'savannah', 'marsh', 'swamp'] as const;
export const FOREST_TERRAINS = ['boreal', 'scrub', 'mixed', 'broadleaf', 'conifer', 'tropical', 'wetland', 'rain'] as const;
export const OTHER_TERRAINS = ['arctic', 'ocean', 'seaLane', 'mountains', 'hills'] as const;

export type OpenTerrain = (typeof OPEN_TERRAINS)[number];
export type ForestTerrain = (typeof FOREST_TERRAINS)[number];
export type OtherTerrain = (typeof OTHER_TERRAINS)[number];
export type TerrainId = OpenTerrain | ForestTerrain | OtherTerrain;

export interface TerrainDef {
  readonly name: string;
  readonly kind: 'open' | 'forest' | 'other';
  readonly water: boolean;
  /** Movement points to enter. */
  readonly moveCost: number;
  /** Defense bonus in units of 25% (2 = +50%). */
  readonly defense: number;
  /** Pioneer turns to clear, plow or build a road here (derived reading of column 3). */
  readonly improve: number;
  /** AI colony-site weight. */
  readonly aiValue: number;
  /** Raw table yields for a free colonist, before the engine adjustments below. */
  readonly yields: Readonly<Record<RawGood, number>>;
}

function row(
  name: string, kind: TerrainDef['kind'], moveCost: number, defense: number, improve: number, aiValue: number,
  y: readonly [number, number, number, number, number, number, number, number, number],
): TerrainDef {
  return {
    name, kind, water: false, moveCost, defense, improve, aiValue,
    yields: { food: y[0], sugar: y[1], tobacco: y[2], cotton: y[3], furs: y[4], lumber: y[5], ore: y[6], silver: y[7], fish: y[8] },
  };
}

export const TERRAIN = {
  tundra: row('Tundra', 'open', 1, 0, 4, 2, [2, 0, 0, 0, 0, 0, 2, 0, 0]),
  desert: row('Desert', 'open', 1, 0, 3, 2, [1, 0, 0, 1, 0, 0, 2, 0, 0]),
  plains: row('Plains', 'open', 1, 0, 3, 4, [4, 0, 0, 2, 0, 0, 1, 0, 0]),
  prairie: row('Prairie', 'open', 1, 0, 3, 4, [2, 0, 0, 3, 0, 0, 0, 0, 0]),
  grassland: row('Grassland', 'open', 1, 0, 3, 4, [2, 0, 3, 0, 0, 0, 0, 0, 0]),
  savannah: row('Savannah', 'open', 1, 0, 3, 4, [3, 3, 0, 0, 0, 0, 0, 0, 0]),
  marsh: row('Marsh', 'open', 2, 1, 5, 2, [2, 0, 2, 0, 0, 0, 2, 0, 0]),
  swamp: row('Swamp', 'open', 2, 1, 7, 2, [2, 2, 0, 0, 0, 0, 2, 0, 0]),

  boreal: row('Boreal Forest', 'forest', 2, 2, 4, 3, [1, 0, 0, 0, 3, 2, 1, 0, 0]),
  scrub: row('Scrub Forest', 'forest', 1, 2, 4, 1, [1, 0, 0, 1, 2, 1, 1, 0, 0]),
  mixed: row('Mixed Forest', 'forest', 2, 2, 4, 3, [2, 0, 0, 1, 3, 3, 0, 0, 0]),
  broadleaf: row('Broadleaf Forest', 'forest', 2, 2, 4, 3, [1, 0, 0, 1, 2, 2, 0, 0, 0]),
  conifer: row('Conifer Forest', 'forest', 2, 2, 4, 3, [1, 0, 1, 0, 2, 3, 0, 0, 0]),
  tropical: row('Tropical Forest', 'forest', 2, 2, 6, 3, [2, 1, 0, 0, 2, 2, 0, 0, 0]),
  wetland: row('Wetland Forest', 'forest', 3, 2, 6, 1, [1, 0, 1, 0, 2, 2, 1, 0, 0]),
  rain: row('Rain Forest', 'forest', 3, 3, 7, 1, [1, 1, 0, 0, 1, 2, 1, 0, 0]),

  arctic: row('Arctic', 'other', 2, 0, 4, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]),
  ocean: { ...row('Ocean', 'other', 1, 0, 2, 3, [0, 0, 0, 0, 0, 0, 0, 0, 3]), water: true },
  seaLane: { ...row('Sea Lane', 'other', 1, 0, 2, 0, [0, 0, 0, 0, 0, 0, 0, 0, 3]), water: true },
  mountains: row('Mountains', 'other', 3, 6, 7, 2, [0, 0, 0, 0, 0, 0, 4, 1, 0]),
  hills: row('Hills', 'other', 2, 4, 4, 2, [1, 0, 0, 0, 0, 0, 4, 0, 0]),
} as const satisfies Record<TerrainId, TerrainDef>;

export const TERRAIN_IDS = [...OPEN_TERRAINS, ...FOREST_TERRAINS, ...OTHER_TERRAINS] as const;

/** Clearing a forest leaves the open type in the same table row, and vice versa. */
export const CLEARED_FROM = {
  boreal: 'tundra',
  scrub: 'desert',
  mixed: 'plains',
  broadleaf: 'prairie',
  conifer: 'grassland',
  tropical: 'savannah',
  wetland: 'marsh',
  rain: 'swamp',
} as const satisfies Record<ForestTerrain, OpenTerrain>;

export const FORESTED_FROM = {
  tundra: 'boreal',
  desert: 'scrub',
  plains: 'mixed',
  prairie: 'broadleaf',
  grassland: 'conifer',
  savannah: 'tropical',
  marsh: 'wetland',
  swamp: 'rain',
} as const satisfies Record<OpenTerrain, ForestTerrain>;

export const DEFENSE_STEP_PERCENT = 25;

export function defensePercent(terrain: TerrainId): number {
  return TERRAIN[terrain].defense * DEFENSE_STEP_PERCENT;
}

/**
 * The engine does not use the table yields as-is.
 * Both rules are derived, so they live here behind one switch; set a field to false to turn a
 * rule off if play testing disproves it.
 */
export interface YieldAdjustments {
  /** Food is one more than the table value wherever the table value is above zero. */
  readonly foodPlusOne: boolean;
  /** Lumber is twice the table value. */
  readonly lumberDoubled: boolean;
}

export const ENGINE_YIELD_ADJUSTMENTS: YieldAdjustments = { foodPlusOne: true, lumberDoubled: true };

export function applyEngineYieldAdjustments(good: RawGood, raw: number, adjust: YieldAdjustments = ENGINE_YIELD_ADJUSTMENTS): number {
  if (good === 'food' && adjust.foodPlusOne && raw > 0) return raw + 1;
  if (good === 'lumber' && adjust.lumberDoubled) return raw * 2;
  return raw;
}

/** What a free colonist with no bonuses produces on bare terrain of this type. */
export function baseYield(terrain: TerrainId, good: RawGood, adjust: YieldAdjustments = ENGINE_YIELD_ADJUSTMENTS): number {
  return applyEngineYieldAdjustments(good, TERRAIN[terrain].yields[good], adjust);
}
