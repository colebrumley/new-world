// Learning a trade from the natives (VICEROY 4000:8026; docs/RULES.md "Learning from natives").
import type { GoodId } from './goods';
import type { ProfessionId } from './professions';

/** The trade taught for each good a settlement has to spare. */
export const SKILL_FOR_GOOD = {
  food: 'expertFarmer', sugar: 'masterSugarPlanter', tobacco: 'masterTobaccoPlanter', cotton: 'masterCottonPlanter', furs: 'expertFurTrapper',
  ore: 'expertOreMiner', silver: 'expertSilverMiner', coats: 'masterFurTrader', cloth: 'masterWeaver',
} as const satisfies Partial<Record<GoodId, ProfessionId>>;

export const LEARNING = {
  /** Goods that count for nothing below a tribe level: [good, least level]. */
  needsLevel: [['coats', 1], ['ore', 1], ['cloth', 2], ['cigars', 2], ['silver', 2], ['rum', 3]],
  /** Camp peoples' food counts half, village peoples' three quarters. */
  foodShare: [[1, 2], [3, 4], [1, 1], [1, 1]],
  /** The Inca's silver counts half again. */
  incaSilver: [3, 2],
  /** A trapper's settlement teaches scouting instead when (x + y) divides by this. */
  scoutEvery: 3,
  /** A farming settlement by the water teaches fishing when a throw of 1..this is under the number of water tiles among the 20 around it. */
  fisherDie: 20,
  /** From this tribal alarm teaching may fail; from the second it is refused, and asking adds the third to the alarm. */
  slowFrom: 25,
  refusedFrom: 50,
  refusalAlarm: 3,
  /** Chance in a thousand of a wary tribe failing to teach: perLevel x difficulty + base. */
  slowBase: 99,
  slowPerLevel: 200,
} as const;

/** Callings that can be taught: only the unskilled who are free or bound, never criminals or converts. */
export const TEACHABLE: readonly ProfessionId[] = ['freeColonist', 'indenturedServant'];
