// Indoor work and the production chain (R-301; docs/RULES.md "Indoor production").
import type { BuildingChain } from './buildings';
import type { AbstractGoodId, GoodId } from './goods';
import type { ProfessionId } from './professions';

export const TRADE_IDS = [
  'distiller', 'tobacconist', 'weaver', 'furTrader', 'carpenter', 'blacksmith', 'gunsmith', 'preacher', 'statesman', 'teacher',
] as const;
export type TradeId = (typeof TRADE_IDS)[number];

export interface TradeDef {
  readonly name: string;
  /** Building chain the work is done in. */
  readonly chain: BuildingChain;
  /** Good consumed one-for-one, if any. */
  readonly input: GoodId | null;
  /** What is produced; null for teachers. */
  readonly output: GoodId | AbstractGoodId | null;
  /** The profession that is expert at it. */
  readonly expert: ProfessionId;
  /**
   * How the building level and the expert bonus combine:
   * - 'craft': base, +base at level 2, +half at level 3, then the expert doubles the lot.
   * - 'flat': 6 for the expert (else base), doubled by the top building of the chain.
   * - 'plain': base, doubled for the expert; the building level does not matter.
   * - 'none': produces nothing.
   */
  readonly rule: 'craft' | 'flat' | 'plain' | 'none';
}

export const TRADES = {
  distiller: { name: 'Distiller', chain: 'distiller', input: 'sugar', output: 'rum', expert: 'masterDistiller', rule: 'craft' },
  tobacconist: { name: 'Tobacconist', chain: 'tobacconist', input: 'tobacco', output: 'cigars', expert: 'masterTobacconist', rule: 'craft' },
  weaver: { name: 'Weaver', chain: 'weaver', input: 'cotton', output: 'cloth', expert: 'masterWeaver', rule: 'craft' },
  furTrader: { name: 'Fur Trader', chain: 'furTrader', input: 'furs', output: 'coats', expert: 'masterFurTrader', rule: 'craft' },
  carpenter: { name: 'Carpenter', chain: 'carpenter', input: 'lumber', output: 'hammers', expert: 'masterCarpenter', rule: 'flat' },
  blacksmith: { name: 'Blacksmith', chain: 'blacksmith', input: 'ore', output: 'tools', expert: 'masterBlacksmith', rule: 'craft' },
  gunsmith: { name: 'Gunsmith', chain: 'armory', input: 'tools', output: 'muskets', expert: 'masterGunsmith', rule: 'craft' },
  preacher: { name: 'Preacher', chain: 'church', input: null, output: 'crosses', expert: 'firebrandPreacher', rule: 'flat' },
  statesman: { name: 'Statesman', chain: 'townHall', input: null, output: 'bells', expert: 'elderStatesman', rule: 'plain' },
  teacher: { name: 'Teacher', chain: 'school', input: null, output: null, expert: 'expertTeacher', rule: 'none' },
} as const satisfies Record<TradeId, TradeDef>;

export const PRODUCTION = {
  /** What one worker makes before any bonus, by the kind of colonist. */
  base: { skilled: 3, indenturedServant: 2, pettyCriminal: 1, indianConvert: 1 },
  /** Carpenters and preachers: the expert's figure in place of the base. */
  flatExpert: 6,
  expertMultiplier: 2,
  /** Chain level whose output is half again as much for no extra input. */
  factoryLevel: 3,
  /** Raw material a factory-level chain needs per unit made, as a fraction. */
  factoryInput: [2, 3],
  /** Workers one building takes. */
  workersPerBuilding: 3,
  /** Teachers by school level: Schoolhouse, College, University. */
  teachers: [0, 1, 2, 3],
  /** Father who makes each preacher half again as productive. */
  preacherFather: 'williamPenn',
} as const;

/**
 * The order in which conversions are settled within a turn. Each uses what is in stock plus
 * what was made this turn, so ore mined this turn becomes tools and those tools become muskets.
 */
export const CONVERSION_ORDER: readonly TradeId[] = ['distiller', 'tobacconist', 'weaver', 'furTrader', 'carpenter', 'blacksmith', 'gunsmith'];
