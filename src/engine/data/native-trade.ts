// Trading with a native settlement (VICEROY 4000:7200, FUN_4000_7f7c; docs/RULES.md "Trade with natives").
import type { GoodId } from './goods';

export const NATIVE_TRADE = {
  /** The settlement's eagerness on the day: a throw of 1..this. */
  moodDie: 5,
  /** Base keenness, and for the made goods (rum onward in the goods order). */
  keenness: 6,
  keennessMade: 7,
  /** Trade goods are a gamble: keenness less a throw of 0..this. */
  tradeGoodsDrop: 7,
  /** Arms and mounts are prized until the tribe has them: keenness plus (this - what the tribe holds). */
  musketsFrom: 12,
  horsesFrom: 10,
  toolsBonus: 1,
  /** Demand at or above this softens the effect of the tribe's ill feeling. */
  strongDemand: 20,
  /** Words for how they value what is offered (rules file), by (demand - ill feeling + 4) / 10. */
  values: ['low quality', 'good', 'fine', 'excellent'],
  /** Selling muskets or horses in these amounts arms or mounts the tribe by one, and by two. */
  armsLots: [25, 50],
  /** Horses sold add a quarter of their number to the breeding stock. */
  breedingDivisor: 4,
  /** A full hundred sold or given wipes the settlement's alarm clean. */
  fullLot: 100,

  /** Goods the natives never sell; food among the three they offer is replaced by coats. */
  neverSold: ['food', 'tradeGoods', 'tools', 'muskets'],
  offered: 3,
  /** A ship is offered a quarter of the quantity a wagon train would be. */
  shipDivisor: 4,
  /** Asking price per hundred: raw goods a flat sum; from horses on (8 - tech) x this... */
  rawPrice: 200,
  madePriceStep: 50,
  /** ...plus, from silver on, the European price x (2 x level + this); plus a throw; less 4 x supply; plus 4 x alarm. */
  europeFactor: 15,
  supplyDiscount: 4,
  alarmSurcharge: 4,
  buyMinimum: 50,
  /** Haggling over a purchase takes a quarter off, never below this. */
  haggleDivisor: 4,
  haggleFloor: 10,

  /** Entering a hostile village: throw 0..this; at or under the alarm all is lost, at or under twice the alarm one is turned away. */
  hostileDie: 500,
} as const;

/** Goods counted as "made" for keenness and for the asking price (from rum on). */
export const MADE_GOODS: readonly GoodId[] = ['rum', 'cigars', 'cloth', 'coats', 'tradeGoods', 'tools', 'muskets'];
/** Goods whose asking price is the flat raw figure (before horses). */
export const RAW_PRICED: readonly GoodId[] = ['food', 'sugar', 'tobacco', 'cotton', 'furs', 'lumber', 'ore', 'silver'];
/** Goods whose asking price follows the European market (silver and after). */
export const EUROPE_PRICED: readonly GoodId[] = ['silver', 'horses', 'rum', 'cigars', 'cloth', 'coats', 'tradeGoods', 'tools', 'muskets'];
