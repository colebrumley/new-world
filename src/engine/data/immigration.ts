// Immigration numbers (VICEROY 3000:2824, 3000:29d4, FUN_3000_399a, FUN_3000_4174; see
// docs/RULES.md "Recruiting" and "Immigration").
import type { ProfessionId } from './professions';
import type { Difficulty } from './yields';

export const IMMIGRATION = {
  poolSize: 3,
  /** The unskilled rolls: one chance in this many, times a difficulty factor, tried in this order. */
  criminalOdds: 15,
  servantOdds: 10,
  freeColonistOdds: 8,
  /** The difficulty factor a computer power uses for those rolls (the second level's). */
  aiLevel: 1,
  /** On turns divisible by this, the replacement for an immigrant is always skilled. */
  skilledEvery: 4,
  /** A veteran soldier arrives mounted with one chance in (this + difficulty level); a computer power's level counts as 1. */
  dragoonOdds: 5,
  /** Crosses needed: base + perHead for every colonist and unit, capped. */
  crossesBase: 8,
  crossesPerHead: 2,
  crossesCap: 4000,
  /** England needs this fraction. */
  englandFactor: [2, 3],
  /** A computer power needs (this - difficulty level) eighths. */
  aiEighths: 8,
  /** Crosses gained each turn with the docks empty, and lost per person kept waiting there. */
  emptyDocksBonus: 2,
  waitingPenalty: 2,
  /** Recruit price: step x (paid recruits + difficulty level + offset), sliding down to a floor as crosses build. */
  priceStep: 20,
  priceOffset: 7,
  priceFloor: 100,
  priceFloorDivisor: 5,
  priceMinimum: 10,
  paidRecruitsCap: 180,
} as const;

/** Chances out of 25 of each skilled immigrant. */
export const SKILLED_IMMIGRANTS = {
  masterCarpenter: 3,
  expertFarmer: 2, expertFisherman: 2, expertLumberjack: 2, expertOreMiner: 2, seasonedScout: 2,
  expertSilverMiner: 1, masterDistiller: 1, masterTobacconist: 1, masterWeaver: 1, masterFurTrader: 1,
  masterBlacksmith: 1, masterGunsmith: 1, firebrandPreacher: 1, elderStatesman: 1, hardyPioneer: 1,
  veteranSoldier: 1, jesuitMissionary: 1,
} as const satisfies Partial<Record<ProfessionId, number>>;

export const UNSKILLED_IMMIGRANTS = ['pettyCriminal', 'indenturedServant', 'freeColonist'] as const satisfies readonly ProfessionId[];

/** Fixed members of a human power's first pool; null slots are drawn. */
export const STARTING_POOL = {
  discoverer: ['masterCarpenter', 'expertFarmer', 'seasonedScout'],
  explorer: ['indenturedServant', 'expertFarmer', 'seasonedScout'],
  conquistador: ['indenturedServant', null, null],
  governor: ['indenturedServant', null, null],
  viceroy: ['pettyCriminal', null, null],
} as const satisfies Record<Difficulty, readonly (ProfessionId | null)[]>;

/** Spain's first pool always opens with this. */
export const SPAIN_FIRST_IMMIGRANT: ProfessionId = 'jesuitMissionary';
/** From this level up, the second starting slot is an ordinary draw rather than a skilled one. */
export const STARTING_POOL_PLAIN_FROM = 3;
