// The colonial score and rating (R-902; docs/RULES.md "Score").

export const SCORE = {
  /** Points per colonist: a specialist, a free colonist, anyone else (servant, criminal, convert). */
  expert: 4,
  free: 2,
  lowly: 1,
  perFather: 5,
  /** One point per this much gold in the treasury. */
  goldPerPoint: 1000,
  /** Declaring before this year, and winning, earns this many points for each year early. */
  earlyBefore: 1780,
  earlyPerYear: 2,
  /** After foreign intervention: one point per this many bells, up to the cap. */
  bellsPerPoint: 100,
  bellsCap: 100,
  /** Winning independence multiplies the total by (base + (base >> powers already independent)) / base. */
  independenceBase: 8,
  /** The rating scales the score by this, per difficulty level, over a hundred. */
  difficultyFactor: [4, 5, 6, 8, 10],
  /** The number of honours to be had. */
  ranks: 24,
} as const;

/**
 * What posterity names after the Viceroy, least to greatest. Our own list, one entry per rank.
 */
export const HONOURS = [
  'a goat track', 'a village pump', 'a ferry landing', 'a tavern', 'a mill pond', 'a market square',
  'a lighthouse', 'a parish', 'a ridge', 'a harbor', 'a schoolhouse', 'a bridge',
  'a street', 'a township', 'a river', 'a fort', 'a county', 'a university',
  'a mountain', 'a city', 'a state', 'a capital city', 'a sea', 'a continent',
] as const;
