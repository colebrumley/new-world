// Food, growth, starvation and horse breeding (R-304; docs/RULES.md "Food and horses").
export const FOOD = {
  /** Food each colonist in a colony eats per turn. */
  perColonist: 2,
  /** Food in store at which a new colonist is born; that much is then used up. */
  growthAt: 200,
  /** Warn when the store would last fewer than this many turns at the present deficit. */
  lowWarningTurns: 4,
  /** Easiest levels: nobody starves before this year... */
  mercyUntilYear: 1520,
  /** ...and afterwards a death that is due happens only one time in this many. */
  mercyOdds: { discoverer: 3, explorer: 2 },
  /** AI colonies shrug off a shortfall smaller than this. */
  aiIgnoredShortfall: 3,
} as const;

export const HORSES = {
  /** No breeding below this many. */
  minimumHerd: 2,
  /** Two new horses for every started herd of this size... */
  perHerd: 2,
  herdSize: 50,
  /** ...or of this size with a Stable. */
  herdSizeWithStable: 25,
  /** Surplus food that makes one horse possible (rounded up), each horse then eating one food. */
  surplusPerHorse: 2,
  stable: 'stable',
} as const;
