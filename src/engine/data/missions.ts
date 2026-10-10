// Missions among the natives (docs/RULES.md "Missions").

export const MISSIONS = {
  /** Founding a mission: each mission the power already has in the tribe adds this much alarm... */
  perMission: 8,
  /** ...against this much goodwill, by the tribe's attitude level. */
  welcome: [25, 15, 10, 5],
  /** At a capital the change is pushed this much further its own way. */
  capitalSwing: 8,

  /** Denouncing: at a capital the incumbent's standing counts this many times, and each side adds a throw of 1..capitalThrow. */
  capitalStanding: 16,
  capitalThrow: 20,

  /** Inciting: the price is (per settlement, per 8 points of might, per musket, per horse herd) x (alarm + base)... */
  incitePerSettlement: 6,
  inciteMightDivisor: 8,
  incitePerMight: 2,
  incitePerMusket: 2,
  incitePerHerd: 2,
  inciteAlarmBase: 75,
  /** ...two thirds for the French, less for each mission the power has in the tribe, for a Jesuit, and at the capital, but never below the minimum. */
  inciteFrenchFactor: [2, 3],
  inciteMissionDiscount: 250,
  inciteExpertMissionDiscount: 1000,
  inciteJesuitDiscount: 1500,
  inciteCapitalDiscount: 500,
  inciteMinimum: 500,
  /** The alarm an incited tribe takes up against the target, and above which it needs no inciting. */
  inciteAlarm: 100,

  /** A friendly visit from a mission settlement brings a convert when a throw of 0..(convertDie - 1) is under tech + convertBase (doubled for an expert mission). */
  convertDie: 16,
  convertBase: 2,
  /** Winning an attack on a settlement holding one's mission: a throw of 0..12 under 4 (8 expert), +4 Spain, +4 Sepulveda, -4 las Casas. */
  forcedDie: 13,
  forcedBase: 4,
  forcedExpert: 8,
  forcedBonus: 4,
  /** A convert kept outside a colony goes home after this many turns. */
  convertPatience: 8,
} as const;
