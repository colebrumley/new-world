// Where native settlements are put when a world is made (VICEROY 6000:3b3e-40b2, 6000:3cc4;
// docs/RULES.md "Settlements").
import type { OpenTerrain } from './terrain';

/** Ground a settlement may stand on, wooded or not. Never hills, mountains, desert, swamp or ice. */
export const SETTLEMENT_TERRAIN = ['tundra', 'plains', 'prairie', 'grassland', 'savannah', 'marsh'] as const satisfies readonly OpenTerrain[];

export const SETTLEMENT_PLACEMENT = {
  /** America: each listed site is tried this often, shifted by two throws of -1..1 on each axis... */
  siteTries: 100,
  /** ...and must be more than this far from every other settlement, the spacing relaxing as tries run out. */
  siteSpacing: [{ untilTry: 33, apart: 3 }, { untilTry: 66, apart: 2 }, { untilTry: 100, apart: 1 }],

  /** Random maps are divided into cells of this size, one settlement to a cell. */
  cell: 5,
  /** Capitals keep clear of the map edges by this much (columns, rows). */
  capitalMargin: [8, 12],
  /** A capital wants to be this far from any other settlement; the demand eases by one every few tries. */
  capitalApart: 90,
  capitalEaseEvery: 4,
  capitalApartFloor: 8,
  capitalTries: 12000,
  /** The two city peoples are held to the west: column no more than tries / this. */
  westwardDivisor: 8,
  /** Attempts at placing the ordinary settlements. */
  spreadTries: 2160,
  /** Within a chosen cell only this many tiles around the middle are considered. */
  cellCore: 1,
} as const;

/** The two tribes kept to the west of a random map. */
export const WESTERN_TRIBES = ['inca', 'aztec'] as const;
