// Cheats (R-1058; docs/RULES.md "Cheats"): the numbers a cheat uses when the player gives none.
export const CHEATS = {
  /** `gold` with no amount adds this much. */
  gold: 1000,
  /** `crosses` with no count adds this many. */
  crosses: 100,
  /** `bells` with no count adds this many. */
  bells: 100,
  /** `reveal` at a square with no radius shows this many squares each way. */
  revealRadius: 3,
  /** What a treasure train made by a cheat carries. */
  treasureGold: 1000,
} as const satisfies Record<string, number>;
