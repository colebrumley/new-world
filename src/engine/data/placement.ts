// Weights for automatic placement of a colonist (R-309; docs/RULES.md "Automatic placement").
export const PLACEMENT = {
  /** A square's score is its yield times this, plus a small bonus for being close. */
  yieldWeight: 8,
  closeness: 7,
  /** Food and fish count this many times over while the colony cannot feed itself. */
  hungerMultiplier: 32,
  /** A colonist doing the work he is expert at counts double. */
  expertMultiplier: 2,
  /** With at least this many colonists, a project chosen and food enough, the first spare hand becomes a carpenter. */
  carpenterFromPopulation: 3,
} as const;
