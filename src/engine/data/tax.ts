// The King's taxes (R-401; docs/RULES.md "Tax").
export const TAX = {
  max: 75,
  /** No tax events before this turn, nor for a power without a colony. */
  firstTurn: 30,
  /** Turns between chances of a tax event, by era (through 1600, then after 1600, 1700, 1750)... */
  period: [18, 15, 12, 9],
  periodEraYears: [1600, 1700, 1750],
  /** ...shortened by this much for each difficulty step above the middle level (lengthened below). */
  periodStepPerDifficulty: 2,
  /** The King has only so many weddings in him. */
  maxWeddings: 30,
  /** Foreign enemies the King's wars are blamed on. */
  enemies: ['Holy Roman Empire', 'Portuguese', 'Ottoman Turks', 'Barbary Pirates', 'Russia', 'Prussia', 'Sweden', 'Denmark'],
  /** Most of a good one party throws in the harbor. */
  partyAmount: 100,
} as const;

/** Outcome bands of the tax roll: below `under`, the rate changes by a random amount in [min, max]. */
export const TAX_BANDS = [
  { under: 100, reason: 'victory', min: -5, max: -2 },
  { under: 650, reason: 'wedding', min: 1, max: 1 },
  { under: 950, reason: 'war', min: 2, max: 2 },
  { under: 1100, reason: 'navigationAct', min: 3, max: 4 },
  { under: Infinity, reason: 'stampAct', min: 5, max: 8 },
] as const;
export type TaxReason = (typeof TAX_BANDS)[number]['reason'] | 'frigate';
