// How native alarm rises and falls (docs/RULES.md "Alarm").
import type { Difficulty } from './yields';

export const ALARM = {
  /** Goodwill is banked in units of this: each full unit moves tribal alarm by one. */
  goodwillPerPoint: 8,
  /** When tribal alarm falls past a multiple of this, every settlement's own alarm is capped... */
  coolingStep: 5,
  /** ...at the first figure if the tribe is now calm (levels 0-1), else at the second. */
  cooledCap: [32, 96],
  /** At full alarm a tribe may burn a power's missions: one chance in this many, times (level + 2). */
  burnOdds: 11,
  /** The level a computer power counts as, where the human's difficulty level would be used. */
  aiLevel: 1,
  /** Cooling: at attitude level L, L x L + 1 throws of one in (this - L x L). */
  coolingDie: 13,
  /** A colony alarms settlements within this distance. */
  colonyRange: 6,
  /** Colonists beyond this count double. */
  colonyEasyPopulation: 6,
  /** Buildings a colony may have before they count against it, and the shift that scales the excess. */
  buildingsAllowed: 8,
  buildingsShift: 2,
  /** Units count toward alarm when their attack value is more than this. */
  militaryAttackOver: 1,
  /** Part of tribal alarm (one in this) added to a settlement's alarm whenever a colony presses on it. */
  tribalShare: 5,
  /** A mission's goodwill per turn, plain and expert; each point also takes this much off the settlement's alarm. */
  missionGoodwill: [1, 4],
  missionCalm: 3,
} as const;

/** How heavily a human power's buildings weigh on its neighbours, as a fraction [numerator, denominator]. */
export const BUILDING_ALARM = {
  discoverer: [1, 2], explorer: [3, 4], conquistador: [1, 1], governor: [3, 2], viceroy: [2, 1],
} as const satisfies Record<Difficulty, readonly [number, number]>;

/** A mission in the settlement changes how much a colony alarms it: [numerator, denominator]. */
export const MISSION_ALARM = {
  foreignExpert: [2, 1], foreign: [3, 2], ownExpert: [1, 2], own: [3, 4],
} as const satisfies Record<string, readonly [number, number]>;
