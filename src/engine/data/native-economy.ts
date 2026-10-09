// What a native settlement makes and wants, from the land around it (VICEROY 4000:6b34;
// docs/RULES.md "Native demand and supply"). Terrain names are our ids for the rules-file terrains.
import type { GoodId } from './goods';

/** Food a settlement gathers from each kind of open ground in its 5 x 5 block. */
export const CENSUS_FOOD = { plains: 5, prairie: 3, grassland: 3, savannah: 3, marsh: 2, swamp: 2 } as const;
/** Cash crops from open ground and from the matching kind of forest. */
export const CENSUS_CROPS = {
  sugar: { open: { savannah: 4, swamp: 2 }, forest: { tropical: 2 } },
  tobacco: { open: { grassland: 4, marsh: 2 }, forest: { conifer: 2 } },
  cotton: { open: { prairie: 4, plains: 1 }, forest: { broadleaf: 2 } },
} as const;
export const CENSUS_ORE = { tundra: 2, marsh: 1, swamp: 1 } as const;
/** Forests rich in fur; the others count a quarter as much. */
export const FUR_FORESTS = ['boreal', 'scrub', 'mixed'] as const;
/** How cold and how hot the country is, summed over the block. */
export const CENSUS_COLD = { arctic: 4, tundra: 3, boreal: 2, scrub: 2, mixed: 2, plains: 2, prairie: 2 } as const;
export const CENSUS_HEAT = { desert: 4, grassland: 2, savannah: 2 } as const;
export const HEAT_OTHER_FOREST = 1;

export const NATIVE_ECONOMY = {
  /** Half-width of the block of land a settlement lives off. */
  blockRadius: 2,
  /** Each ocean tile adds tech + 1 to a counter; every `oceanPer` of it is `oceanFood` food. */
  oceanPer: 3,
  oceanFood: 2,
  forestFood: 1,
  /** Demand never exceeds this. */
  demandMax: 50,
  /** Silver from each mountain in the block, and for the Inca. */
  silverPerMountain: 4,
  silverPerMountainInca: 8,
  /** Tribal memory of trade: beyond `stockSlack`, every `stockStep` units move demand or supply by `stockEffect`. */
  stockSlack: 50,
  stockStep: 100,
  stockEffect: 2,
  /** How many goods a settlement is said to want. */
  wanted: 3,
} as const;

/** Goods whose demand is doubled in a capital, and those raised by half. */
export const CAPITAL_DEMAND_DOUBLE: readonly GoodId[] = ['food', 'sugar', 'tobacco', 'cotton', 'furs', 'lumber', 'ore', 'silver'];
export const CAPITAL_DEMAND_HALF_MORE: readonly GoodId[] = ['tradeGoods', 'tools', 'muskets'];
/** Goods a capital has twice as much of to offer. */
export const CAPITAL_SUPPLY_DOUBLE: readonly GoodId[] = ['silver', 'horses', 'rum', 'cigars', 'cloth', 'coats', 'tradeGoods', 'tools', 'muskets'];
