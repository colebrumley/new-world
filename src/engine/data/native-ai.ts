// How braves behave (R-507). The figures here are our own, chosen to give this
// behaviour:
// braves stay near home, call on colonies that are close, and hunt their enemies when hostile.
export const NATIVE_AI = {
  /** How far from home a brave strays when at peace, by tribe level (the nomads go furthest). */
  roam: [4, 3, 3, 3],
  /** How far it will go looking for an enemy when its tribe or settlement is hostile. */
  warRange: 9,
  /** A brave notices colonies within this distance and drifts toward the nearest. */
  colonyNotice: 5,
  /** Chance in a hundred that an idle step is taken toward a noticed colony rather than at random. */
  visitUrge: 40,
  /** Chance in a hundred that a brave standing beside a colony pays a call this turn; otherwise it wanders on. */
  callChance: 12,
  /** A brave takes at most this many steps in a turn. */
  maxSteps: 20,
  /** Horses breed by the number of herds each turn, up to twice (the tribe's people + this). */
  breedingCapBase: 25,
  /** After the Declaration a tribe with a grudge (or one in 400 per point of alarm) may side with the Crown: one chance in 2 x (5 - level) + 1. */
  crownRollPerAlarm: 400,
  crownAlarmFrom: 25,
  crownAlarm: 100,
} as const;
