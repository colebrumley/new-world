// The Continental Congress (docs/RULES.md "Continental Congress").
export const CONGRESS = {
  /** Bells for the next Founding Father: (fathers so far + 1) x base + 1, halved for the first. */
  /** A human's base is this x (difficulty level + levelOffset)... */
  humanBase: 16,
  humanLevelOffset: 3,
  /** ...a computer power's is this x (aiLevelFrom - difficulty level). */
  aiBase: 8,
  aiLevelFrom: 14,
  /** The base grows by half at each of these years. */
  dearerFrom: [1600, 1650, 1700, 1750],
  /** Coronado shows the country this far around every colony. */
  coronadoRadius: 5,
  /** La Salle gives a stockade to colonies of at least this many. */
  laSallePopulation: 3,
  /** Each Founding Father is worth this much in the final score. */
  scorePerFather: 5,
} as const;
