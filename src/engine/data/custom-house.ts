// Custom House numbers (docs/RULES.md "Custom House").
export const CUSTOM_HOUSE = {
  building: 'customHouse',
  /** A flagged good is exported once this much is in store after the turn's production... */
  sellAt: 100,
  /** ...and this much is kept back. */
  keep: 50,
  /** A foreign warship this close stops a human power's exports. */
  blockadeRadius: 5,
} as const satisfies Record<string, string | number>;
