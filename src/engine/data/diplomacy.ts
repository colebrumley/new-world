// Dealings between the colonial powers (docs/RULES.md "Diplomacy").
export const DIPLOMACY = {
  /** A power grants another audience only this many turns after the last, unless asked through a mayor. */
  audienceEvery: 16,
  /** After a talk that ends in peace the computer power keeps the peace for 2 x (this - level) turns. */
  truceLevels: 6,
  /** A power that means to break a treaty does so one turn in this many once its truce has run out. */
  breakOdds: 4,
  /** A privateer's attack leaves a lasting grievance (level + 1) times in this many. */
  piracyGrievanceOdds: 101,
  /** Tribute and the like are reckoned in steps of this much gold, between these numbers of steps. */
  goldStep: 50,
  demandSteps: [0, 400],
  /** During a war ordered by the King the demand is this much higher per (level + 1). */
  kingsWarDemand: 500,
  /** The demand is softened early in the game: halved before the first turn here, three quarters before the second. */
  earlyTurns: [50, 100],
  /** A small power (at most this many colonies and fewer than this many colonists) is asked half. */
  smallPower: [2, 8],
  /** A demand a little beyond the treasury is cut to fit, if the treasury holds at least this. */
  cutToFitAbove: 300,
  /** Troops beside their colonies provoke a complaint at a quarter of the colonies' people, or above this figure one time in five. */
  siegeShare: 4,
  siegeAlways: 12,
  siegeOdds: 5,
  /** Each point of such troops withdrawn takes this much off the demand. */
  siegeRelief: 100,
  /** A treaty in force is broken over a demand above this. */
  provokeAbove: 100,
  /** Paying them to withdraw: this x (level + 2) per point of their strength at our gates, at least the minimum. */
  withdrawPrice: 25,
  withdrawMinimum: 100,
  /** Hiring them against a third party: goldStep x a figure kept between these bounds. */
  allianceSteps: [10, 200],
  /** Bullying starts from this turn, by a power with more than this many colonies. */
  bullyFromTurn: 80,
  bullyColonies: 3,
  /** Computer powers consider each other only every third turn, and not before this turn. */
  aiTalkEvery: 3,
  aiWarFromTurn: 40,
  aiWarPopulation: 7,
  /** Goods sold in a foreign colony (with de Witt) fetch this fraction of the buyer's home price. */
  foreignSale: [3, 4],
} as const;
