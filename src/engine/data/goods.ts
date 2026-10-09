// Cargo types, in NAMES.TXT @CARGO order. The first 16 are tradeable goods that fill holds and
// warehouses; hammers, crosses and liberty bells are produced but never carried.
// The market columns of the table are in data/market.ts.
import { MARKET } from './market';

export const GOOD_IDS = [
  'food', 'sugar', 'tobacco', 'cotton', 'furs', 'lumber', 'ore', 'silver', 'horses',
  'rum', 'cigars', 'cloth', 'coats', 'tradeGoods', 'tools', 'muskets',
] as const;
export type GoodId = (typeof GOOD_IDS)[number];

export const ABSTRACT_GOOD_IDS = ['hammers', 'crosses', 'bells'] as const;
export type AbstractGoodId = (typeof ABSTRACT_GOOD_IDS)[number];

export const GOOD_NAMES = {
  food: 'Food', sugar: 'Sugar', tobacco: 'Tobacco', cotton: 'Cotton', furs: 'Furs', lumber: 'Lumber',
  ore: 'Ore', silver: 'Silver', horses: 'Horses', rum: 'Rum', cigars: 'Cigars', cloth: 'Cloth',
  coats: 'Coats', tradeGoods: 'Trade Goods', tools: 'Tools', muskets: 'Muskets',
  hammers: 'Hammers', crosses: 'Crosses', bells: 'Liberty Bells',
} as const satisfies Record<GoodId | AbstractGoodId, string>;

/** A hold carries up to this many of one good. */
export const HOLD_CAPACITY = 100;

/** Goods the "load most valuable" order leaves on the dock: a colony's working equipment. */
export const NOT_AUTO_LOADED: readonly GoodId[] = ['horses', 'tools', 'muskets'];

/** Opening bid range in Europe (start 1, start 2 of the market table). */
export const START_BID = Object.fromEntries(GOOD_IDS.map((g) => [g, MARKET[g].start])) as Record<GoodId, readonly [number, number]>;

/** Rough worth of one unit of a good where no live price applies (AI placement, load ordering before a market exists). */
export function nominalValue(good: GoodId): number {
  return (START_BID[good][0] + START_BID[good][1]) / 2;
}
