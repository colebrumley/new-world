// Liberty bells, Sons of Liberty and Tories (R-306; docs/RULES.md "Sons of Liberty").
export const LIBERTY = {
  /** Bells every colony makes with nobody in the Town Hall. */
  freeBells: 1,
  /** Fathers: half again the colony's bells; bells raised by the tax rate; +20 points of membership. */
  jefferson: 'thomasJefferson',
  paine: 'thomasPaine',
  bolivar: 'simonBolivar',
  bolivarPoints: 20,
  /** Membership bookkeeping: the denominator moves by this much per colonist joining or leaving... */
  perColonist: 100,
  /** ...a new colony starts with this much before its founder is counted... */
  initialDenominator: 100,
  /** ...and each turn both figures shed one part in this many, */
  decayDivisor: 64,
  /** while the denominator gains this much per colonist. */
  denominatorPerColonist: 2,
  /** A colony making fewer bells than it has people loses (membership % / this) of them. */
  smallColonyDivisor: 20,
  /** Membership at which the first and second production bonus are earned. */
  majority: 50,
  unanimous: 100,
  /** The second bonus is kept until membership falls below this. */
  unanimousKeptAbove: 95,
  /** Tories it takes to cost one unit of production, by difficulty. */
  toryThreshold: { discoverer: 10, explorer: 9, conquistador: 8, governor: 7, viceroy: 6 },
} as const;
