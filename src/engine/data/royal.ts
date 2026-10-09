// The Crown's dealings with a colonial power (R-406; docs/RULES.md "Royal events").
// Sources: VICEROY FUN_3000_3a80, 2000:ce86, 5000:a478, FUN_3000_bd62, 3000:c264, FUN_3000_a238, 2000:d32c, 7000:329b.

export const ROYAL = {
  /** The Royal Expeditionary Force at the start: base + perLevel x difficulty level. */
  refStart: { regulars: [15, 8], cavalry: [5, 5], artillery: [2, 6], ships: [2, 3] },
  /** Royal money grows by base + perLevel x level each turn, doubling from each of these years on... */
  moneyBase: 10,
  moneyPerLevel: 8,
  moneyDoublingYears: [1600, 1700, 1750],
  /** ...and every time it reaches this much, the Crown adds a unit to the force. */
  unitCost: 1800,

  /** A new European war needs (level + 2) x turn to reach this. */
  warMinimum: 800,
  /** The war roll is 0..(4 - rivals at peace) x this, and war comes when it is no more than the level. */
  warRollStep: 20,
  /** War aid: gold per (level + 1), gold per point of the rival's lead, and its cap per (5 - level). */
  warGold: 100,
  warGoldPerLead: 25,
  warGoldCap: 500,
  /** One veteran soldier, plus one per this many points (as a shift) of the rival's lead, at most (this - level). */
  warSoldiersShift: 3,
  warSoldiersCap: 6,

  /** A war the King orders is his affair for this many turns: the rival presses harder and will not parley. */
  kingsWarTurns: 16,

  /** The frigate question comes up on turns divisible by this... */
  frigatePeriod: 8,
  /** ...when a foreign frigate is within this many squares of a colony, or foreign warships near more than this many colonies. */
  threatRadius: 5,
  frigateColonies: 3,
  /** Accepting the frigate costs this many points of tax. */
  frigateTax: 10,

  /** Share of a treasure the Crown keeps for carrying it: the larger of twice the tax rate and base + step x level, capped. */
  transportBase: 50,
  transportStep: 5,
  transportCap: 90,

  /** Mercenaries are offered one turn in this many. */
  mercenaryOdds: 21,
  /** Price per unit weight: (2 x (level + this) + 0..spread) hundreds; artillery weighs double. */
  mercenaryLevelOffset: 4,
  mercenarySpread: 6,
  mercenaryArtilleryWeight: 2,

  /** The War of Succession breaks out when a human power's rebel sentiment first reaches this. */
  successionSentiment: 50,
  /** Size of a power for the succession: weights for ships, colonies and colonists. */
  successionWeights: { ships: 3, colonies: 2, colonists: 1 },

  /** A computer power is granted independence when its rebels reach this x (8 - level). */
  independenceStep: 10,
  independenceLevels: 8,
  /** It is talked of when within this many of the mark, and forgotten after falling this far. */
  independenceNear: 20,
  independenceDrop: 5,
} as const;

export type RefUnit = 'regulars' | 'cavalry' | 'artillery' | 'ships';
export const REF_UNITS = ['regulars', 'cavalry', 'artillery', 'ships'] as const satisfies readonly RefUnit[];
