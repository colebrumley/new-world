// Numbers used by the tile yield rule (docs/RULES.md "Tile yield").
// See docs/FIDELITY.md.
import type { RawGood } from './terrain';

export const DIFFICULTIES = ['discoverer', 'explorer', 'conquistador', 'governor', 'viceroy'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DEFAULT_DIFFICULTY: Difficulty = 'conquistador';

export const YIELD_RULES = {
  /** Fish change by number of water neighbours (of 8): [min neighbours, delta], first match wins. */
  fishByWaterNeighbors: [[8, -2], [6, -1], [0, 1]],
  /** Furs get these before any multiplier. */
  fursRoadPre: 1,
  fursMinorRiverPre: 1,
  fursMajorRiverPre: 2,
  /** Flat bonus for the two food experts; the other experts multiply. */
  foodExpertAdd: 2,
  expertMultiplier: 2,
  roadGoods: ['furs', 'lumber', 'ore', 'silver', 'fish'],
  plowGoods: ['food', 'sugar', 'tobacco', 'cotton'],
  convertGoods: ['food', 'sugar', 'tobacco', 'cotton', 'furs', 'fish'],
  convertBonus: 1,
  hudsonFursMultiplier: 2,
  /** Silver from ground with no deposit: this much with a road or an expert, else nothing. */
  bareSilver: 1,
} as const satisfies Record<string, number | readonly RawGood[] | readonly (readonly [number, number])[]>;

export const CENTER_TILE = {
  /** Food by terrain row; anything not listed gets `foodDefault`. */
  foodDefault: 3,
  food: {
    arctic: 0, desert: 1, scrub: 1, mountains: 2, hills: 2,
    boreal: 2, mixed: 2, broadleaf: 2, conifer: 2, tropical: 2, wetland: 2, rain: 2,
  },
  foodByDifficulty: { discoverer: 2, explorer: 1, conquistador: 0, governor: 0, viceroy: 0 },
  secondaryByDifficulty: { discoverer: 1, explorer: 0, conquistador: 0, governor: 0, viceroy: 0 },
  plowFood: 1,
  /** Oasis, Wheat and Game add this much food. */
  resourceFood: 2,
  foodResources: ['oasis', 'wheat', 'game'],
  /** Candidates for the second product, in tie-break order. Never lumber. */
  secondaryGoods: ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver'],
  minorRiver: 1,
  majorRiver: 2,
} as const;

export const DEPLETION = {
  /** Counter value at which the worked deposits around a colony run out. */
  threshold: 50,
  /** Chance per unit of weight to tick the counter = (d + 1) / (d + 2), d = difficulty index. */
  weight: { mineralsOre: 1, mineralsSilver: 2, silverDepositSilver: 1 },
} as const;
