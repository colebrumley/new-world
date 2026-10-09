import type { Difficulty } from './yields';
// Atlantic crossing numbers (R-203; docs/RULES.md "Europe travel").
export const VOYAGE = {
  /** Whole turns a ship is out of play each way: it arrives at the start of its owner's turn this many turns after leaving. */
  turns: 2,
  /** A crossing sometimes takes one turn longer... */
  slowTurns: 3,
  /** ...when a 1..100 roll is at least this, */
  slowRollFrom: 90,
  /** the owner has at least this many ships, */
  slowMinShips: 3,
  /** and does not have this Founding Father. */
  slowUnlessFather: 'ferdinandMagellan',
  /** Turning a ship around mid-voyage: it needs this many turns to get back. */
  reverseTurns: 2,
} as const;

/** Gold a human power starts with, by difficulty. AI powers start with none. */
export const STARTING_GOLD = { discoverer: 1000, explorer: 300, conquistador: 0, governor: 0, viceroy: 0 } as const satisfies Record<Difficulty, number>;
