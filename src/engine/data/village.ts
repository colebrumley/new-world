// Visiting a native settlement (VICEROY 4000:8f08, 4000:83ca, 4000:8800, 5000:483e;
// docs/RULES.md "Entering a settlement").

/** What a unit may do at a settlement, in the order the original lists them. */
export const VILLAGE_ACTIONS = ['trade', 'enterHostile', 'establishMission', 'denounce', 'liveAmong', 'speakWithChief', 'incite', 'demandTribute', 'attack'] as const;
export type VillageAction = (typeof VILLAGE_ACTIONS)[number];

export const VILLAGE_ACTION_NAMES = {
  trade: 'Trade With Village',
  enterHostile: 'Enter Hostile Village',
  establishMission: 'Establish Mission',
  denounce: 'Denounce Heresy',
  liveAmong: 'Live Among The Natives',
  speakWithChief: 'Ask to Speak With Chief',
  incite: 'Incite Indians',
  demandTribute: 'Demand Tribute',
  attack: 'Attack Village',
} as const satisfies Record<VillageAction, string>;

export const VILLAGE = {
  /** A treaty refused sets the tribe against the power by this much. */
  treatyRefusedAlarm: 100,

  /** Speaking with the chief: the scout's roll is 0..this, or 0..the second for a seasoned scout... */
  chiefRoll: [100, 140],
  /** ...and above this alarm the scout dies when a quarter of the alarm reaches the roll. */
  chiefRiskFrom: 25,
  chiefRiskDivisor: 4,
  /** One tribe is quicker to kill: one chance in (this - difficulty level), halved for a seasoned scout. */
  wariestTribe: 'arawak',
  wariestOdds: 8,
  /** The chief's favours: three, equally likely. */
  chiefFavours: ['promotion', 'tales', 'gift'],
  /** Tales show the country this far around. */
  talesRadius: 6,
  /** Gift: three throws of 1..(this - difficulty level), times 1..giftTimes, times giftScale, times (tech + 1). */
  giftDie: 10,
  giftTimes: 6,
  giftScale: 4,

  /** Tribute: the least and most handed over, and how supply sets the most (3 x supply + 10). */
  tributeLeast: 10,
  tributeMost: 100,
  tributePerSupply: 3,
  tributeBase: 10,
  /** Above this alarm a demand is laughed at; above the second it is refused. */
  tributeRefusedFrom: 50,

  /** Entering a hostile village with goods: roll 0..this; at or under the alarm the cargo and its carrier are lost, at or under twice the alarm they are turned away. */
  hostileRoll: 500,
} as const;
