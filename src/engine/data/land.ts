// Buying or taking native land (VICEROY FUN_4000_40c2, 2000:6746, 3000:e4f4; docs/RULES.md "Native land").
export const LAND = {
  /** Price steps: a human pays this per point, a computer power the second figure. */
  unit: 65,
  aiUnit: 50,
  /** A human's points start at 2 x (level + this); a computer power's at aiBase - level. */
  humanBase: 3,
  aiBase: 12,
  /** A power with fewer colonists than this gets half the shortfall off. */
  smallPowerColonists: 10,
  /** Taking land (or working it unpaid) angers the tribe by k x (level + take); a road by k x (level + road). k is 3 beside the settlement, 2 at distance two, 1 beyond. */
  takeAlarm: 5,
  roadAlarm: 3,
  /** A computer power buys when its gold is at least this many halves of the price. */
  aiBuysAtHalves: 3,
} as const;
