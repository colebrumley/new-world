// The Europe market model per good. Each row:
//   start 1, start 2 (opening bid range), low, high (limits of drift), burden (extra gap
//   between ask and bid; 0 means ask is 1 above bid), rise, fall (traffic levels at which the
//   price moves), attrition (added to traffic each turn), volatility (shift applied to traffic).
import type { GoodId } from './goods';

export interface MarketDef {
  readonly start: readonly [number, number];
  readonly low: number;
  readonly high: number;
  readonly burden: number;
  readonly rise: number;
  readonly fall: number;
  readonly attrition: number;
  readonly volatility: number;
}

function m(start1: number, start2: number, low: number, high: number, burden: number, rise: number, fall: number, attrition: number, volatility: number): MarketDef {
  return { start: [start1, start2], low, high, burden, rise, fall, attrition, volatility };
}

export const MARKET = {
  food: m(1, 3, 1, 6, 7, 3, 2, -1, 0),
  sugar: m(4, 7, 3, 7, 1, 4, 6, -8, 1),
  tobacco: m(3, 5, 2, 5, 1, 4, 8, -10, 1),
  cotton: m(2, 5, 2, 5, 1, 4, 6, -11, 1),
  furs: m(4, 6, 2, 6, 1, 4, 20, -13, 1),
  lumber: m(2, 2, 2, 2, 4, 3, 2, 0, 0),
  ore: m(3, 6, 2, 6, 2, 2, 4, -7, 0),
  silver: m(20, 20, 2, 20, 0, 8, 1, -8, 2),
  horses: m(2, 3, 2, 11, 0, 3, 2, -3, 0),
  rum: m(11, 13, 1, 20, 0, 4, 4, -12, 1),
  cigars: m(11, 13, 1, 20, 0, 4, 4, -11, 1),
  cloth: m(11, 13, 1, 20, 0, 4, 4, -13, 1),
  coats: m(11, 13, 1, 20, 0, 4, 4, -11, 1),
  tradeGoods: m(2, 3, 2, 12, 0, 2, 3, 4, 0),
  tools: m(2, 2, 2, 9, 0, 2, 2, 5, 0),
  muskets: m(3, 3, 2, 20, 0, 2, 2, 6, 0),
} as const satisfies Record<GoodId, MarketDef>;

/** The ask price is this much above the bid, plus the good's burden. */
export const ASK_OVER_BID = 1;

/** Immigrant classes and their passage cost. */
export const IMMIGRANT_CLASSES = {
  pettyCriminals: { name: 'Petty Criminals', cost: 300 },
  indenturedServants: { name: 'Indentured Servants', cost: 400 },
  peasantFarmers: { name: 'Peasant Farmers', cost: 600 },
  skilledCraftsmen: { name: 'Skilled Craftsmen', cost: 800 },
  hardyPioneers: { name: 'Hardy Pioneers', cost: 1450 },
  townMerchants: { name: 'Town Merchants', cost: 1500 },
  trainedMercenaries: { name: 'Trained Mercenaries', cost: 1900 },
  educatedElite: { name: 'Educated Elite', cost: 2000 },
} as const;

/** Numbers of the price model that are not in the cargo table (docs/RULES.md "Market"). */
export const MARKET_MODEL = {
  /** Traffic at which a price moves is the table's rise or fall times this. */
  thresholdScale: 100,
  /** Largest amount one transaction moves. */
  lot: 100,
  /** Each power starts with the same shared volume per good, drawn in this range. */
  sharedVolume: [600, 1000],
  /** The shared volume loses its total shifted right by this many bits whenever England's market is evaluated. */
  sharedDecayShift: 7,
  /** A human's trade counts for 16% more or less per difficulty step from the middle level; AI trades use the lowest. */
  difficultyStepPercent: 16,
  middleDifficulty: 2,
  /** The Dutch feel only this fraction of anybody's sales, and their attrition doubles on odd turns. */
  dutchSaleShare: [2, 3],
  /** Rum, cigars, cloth and coats are priced against one another: equilibrium = this x the group's volume / the good's own. */
  processed: ['rum', 'cigars', 'cloth', 'coats'],
  /** Sugar, tobacco, cotton and furs get a much weaker pull of the same kind (furs counted at half volume). */
  raw: ['sugar', 'tobacco', 'cotton', 'furs'],
  groupFactor: 3,
  /** Furs are in fashion early: the equilibrium is one higher before each of these years. */
  fursFashionYears: [1600, 1700],
  /** Paying off a boycott costs this many times the good's ask price. */
  backTaxUnits: 500,
  maxTax: 75,
} as const;
