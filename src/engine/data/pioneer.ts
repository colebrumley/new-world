// Pioneer work numbers (R-204; docs/RULES.md "Pioneer work").
import type { TerrainId } from './terrain';

export const PIONEER_WORK = {
  /** Clearing or plowing takes this many turns more than the terrain's improvement value; a road takes exactly that value. */
  plowExtraTurns: 2,
  /** A Hardy Pioneer needs the turns divided by this, rounded down. */
  hardyDivisor: 2,
  /** Terrain that cannot be plowed (it can still take a road). */
  noPlow: ['hills', 'mountains'],
  /** Lumber from clearing a forest goes to the nearest own colony within this distance. */
  lumberRange: 3,
  /** Lumber per unit of the formula; without a Lumber Mill the grant is one lot. */
  lumberLot: 20,
  hardyLumberMultiplier: 2,
  lumberMill: 'lumberMill',
} as const satisfies Record<string, number | string | readonly TerrainId[]>;

/** Warehouse room for one good: 100 with no warehouse, 200 with one, 300 with the expansion. */
export const WAREHOUSE = {
  base: 100,
  step: 100,
  buildings: ['warehouse', 'warehouseExpansion'],
} as const;
