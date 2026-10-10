// The Declaration of Independence and the Crown's answer to it (R-900; docs/RULES.md
// "Declaration of Independence").

export const INDEPENDENCE = {
  /** National rebel sentiment needed to declare, per cent. */
  sentimentNeeded: 50,

  /** A colony musters Continentals only from this Sons of Liberty membership up... */
  musterFrom: 50,
  /** ...one veteran per this many points above it for every hundred colonists... */
  musterSpan: 50,
  /** ...and never more than the population divided by this. */
  musterShare: 2,

  /** Bells toward foreign intervention: base + perLevel x difficulty level. */
  interventionBells: [2000, 1500],
  /** The intervention force. `spare` is (this - level) halved; each kind starts from its base. */
  force: {
    spare: 4,
    ships: 3,
    artillery: 3,
    /** Artillery grows with the friend's whole land strength, shifted down by this. */
    artilleryShift: 5,
    cavalry: 1,
    /** Cavalry grows with the friend's land strength in the field, shifted down by this. */
    cavalryShift: 4,
    /** Infantry: this less the level, plus one per `colonistsPerInfantry` of the friend's colonists. */
    infantry: 8,
    colonistsPerInfantry: 10,
    /** Guns and horse are held to this many per ship, all land units together to `unitsPerShip`. */
    supportPerShip: 2,
    unitsPerShip: 6,
    /** Land strength is defence x this (half as much again for veterans), and no more than `strengthMost`. */
    strengthScale: 8,
    strengthMost: 255,
  },

  /** Landings: with fewer than this left in all, the wave is the last and the rest is forfeited. */
  lastWaveBelow: 5,
  /** Only this many of the rebels' ports are weighed. */
  portsWeighed: 10,
  /** A port's attraction: population x (Tory per cent + this) less `perDefender` for each armed defender. */
  toryBonus: 25,
  perDefender: 75,
  /** What it takes to carry a colony: one, plus one per hundred muskets (rounded from `musketRound`)... */
  musketsPerPoint: 100,
  musketRound: 50,
  /** ...plus each defender's strength shifted down by this, times these for the works. */
  needShift: 4,
  fortressFactor: 2,
  fortFactor: 1.5,
  /** The second pass settles for this much. */
  needEnough: 6,
  /** Cavalry and artillery per wave: need shifted down by this, at least one, at most `supportMost` while regulars last. */
  supportShift: 3,
  supportMost: 2,
  /** A wave is between these many units. */
  waveLeast: 3,
  waveMost: 6,

  /** Tory uprising: each colonist of Tory mind counts this much... */
  toryWeight: 2,

  /** Help from abroad lands at most this many units a ship, of which this many horse and this many guns. */
  aidPerShip: 6,
  aidSupport: 2,
  /** Soldiers for hire in wartime: offered one turn in this many... */
  hireOdds: 3,
  /** ...at least this many foot, with one troop of horse or one battery... */
  hireLeast: 2,
  /** ...for 100 x (2 x (level + this) + 0..`hireSpread`) a head, horse and guns counting `hireSupportWeight` heads. */
  hireLevelOffset: 3,
  hireSpread: 6,
  hireSupportWeight: 2,

  /** The King has won when he holds this share of the people in colonies, per cent; the rebels are warned from `warnShare`. */
  lostShare: 90,
  warnShare: 80,
  /** A warning also comes with fewer than this many ports, or colonies. */
  warnFewer: 3,
  /** The rebels have won when the King's troops ashore number fewer than this (`fewAfterVictory` once they have beaten him in a fight)... */
  fewAshore: 1,
  fewAfterVictory: 8,
  /** ...and what he has left to send comes to less than this. */
  fewInReserve: 4,
  /** The Crown's commanders attack a unit in the open only at these odds or better, per cent. */
  crownAttackOdds: 50,
} as const;
