// Numbers the computer powers plan by (R-802). These are ours: the original's own planning was
// only outlined, so they are tuned to give sensible play rather than copied.
export const AI_PLAN = {
  /** Colonies wanted at the start, one more every so many turns, up to a limit; the leader's bent for expansion shifts it. */
  coloniesAtStart: 4,
  turnsPerExtraColony: 50,
  coloniesMost: 8,
  /** New colonies keep this far from any other. */
  colonySpacing: 3,
  /** A site scores 2 for each workable square around it, 1 for sea or native land, 2 for a resource; below this it is passed over. */
  siteScoreLeast: 9,
  /** Until its first colony stands, a power counts each square of distance to a site this many times over. */
  firstColonyHaste: 6,
  /** From this turn a power still without a colony founds one wherever its settlers stand, if the ground allows. */
  firstColonyAnywhereFrom: 6,
  /** How far a ship, and a party on foot, look for a site. */
  shipSearch: 14,
  landSearch: 7,
  /** Buildings a colony puts up before anything else, as soon as each is open to it. */
  buildFirst: ['stockade', 'printingPress', 'newspaper'],
  /** A colony of at least this many seats a statesman, and one more for every so many colonists (three at most), if it can still feed itself. */
  statesmanFrom: 3,
  colonistsPerStatesman: 3,
  /** Soldiers settle too until the power has this many colonies; after that they stand guard. */
  coloniesBeforeGarrison: 2,
  /** Beyond the garrison (see AI_CAMPAIGN) it arms this many more soldiers on the docks while a native people is hostile to it. */
  reprisalParty: 4,
  /** One more ship is bought for every so many colonies, once the treasury holds the fund for it. */
  coloniesPerShip: 3,
  shipFund: 4000,
  /** A ship tries this many anchorages beside a site before giving it up for the turn. */
  berthsTried: 3,
  /** Gold kept back when paying a recruit's passage. */
  goldReserve: 200,
  /** A power's turn is cut off after this many actions. */
  actionsPerTurn: 250,
  /** Goods a computer power's colonies sell by themselves, as if through a Custom House. */
  colonyExports: ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats'],
} as const;

// Wagon trains and trade with the native peoples by computer powers (R-804), as traced from the
// original program; see docs/RULES.md "Computer powers: wagon trains".
export const AI_WAGONS = {
  /** A colony builds a wagon train only before this year... */
  buildBeforeYear: 1600,
  /** ...and while the nearest tribe's alarm toward the power is below this. */
  buildAlarmBelow: 50,
  /** Goods a wagon never loads for the natives. */
  neverLoaded: ['lumber', 'tools', 'muskets'],
  /** A good is loaded only with this much in store; a cargo is this much at most. */
  stockLeast: 50,
  cargo: 100,
  /** Only goods whose price level in Europe is below the limit: the second is for trade goods. */
  priceLimit: 4,
  tradeGoodsLimit: 8,
  /** The price is first marked down a step with one chance in this many, again and again while it is at least `markdownFrom`. */
  markdownOdds: 4,
  markdownFrom: 2,
  /** Score = stock x (limit - price) + this x (1 - price); stock counts this many times over once the warehouse is full. */
  pricePenalty: 5,
  fullStockTimes: 2,
  /** A capital counts as this many times nearer than it is. */
  capitalNearer: 2,
  /** A colony with a wagon orders trade goods while it holds under this many and their price level is no more than the second. */
  tradeGoodsBelow: 100,
  tradeGoodsPriceMost: 3,
} as const;

// Missionaries of the computer powers and what their units do at a native settlement (R-805),
// as traced from the original program; see docs/RULES.md "Computer powers: missions".
export const AI_MISSIONS = {
  /** A missionary is made only after this turn, on turns divisible by `every`... */
  afterTurn: 50,
  every: 7,
  /** ...from `rarerFrom` on only one time in `rarerOdds`, and a skilled colonist only one time in `skilledOdds`. */
  rarerFrom: 200,
  rarerOdds: 4,
  skilledOdds: 8,
  /** A settlement scores the tribe's alarm toward the power x this / (distance + 1), half again for a capital. */
  alarmWeight: 8,
  /** Inciting: the tribe's alarm toward the human must be below this, and the power must hold this much gold... */
  inciteAlarmBelow: 75,
  inciteGold: 1500,
  /** ...this much to make the journey to a settlement that already holds its own mission. */
  inciteJourneyGold: 2500,
  /** Where no mission stands it incites only this many times in `inciteOdds`. */
  inciteTimes: 4,
  inciteOdds: 5,
  /** A power's rank: gold / this + this x colonies + colonists + land strength. */
  rankGoldPer: 100,
  rankPerColony: 2,
  /** A colonist steps in to live among the natives, and a scout to speak with the chief, only below this tribal alarm... */
  visitAlarmBelow: 25,
  /** ...a colonist only where the settlement's own alarm is below this; once inside he stays only below the last. */
  visitSettlementAlarmBelow: 64,
  liveAmongAlarmBelow: 75,
} as const;

// Warships and privateers of the computer powers (R-806), as traced from the original program;
// see docs/RULES.md "Computer powers: warships and privateers".
export const AI_NAVY = {
  /** A station at every enemy ship in sight, and at every foreign privateer whatever the treaty. */
  enemyShipPriority: 3,
  /** A foreign ship is in sight within its own sight range of one of our units, or this near one of our colonies. */
  colonySight: 2,
  /** A blockade station lies this far off a port colony of a power not at firm peace; priority = base + min(most, (population + add) >> shift). */
  blockadeDistance: 2,
  blockadeBase: 2,
  blockadeMost: 2,
  blockadePopulationAdd: 4,
  blockadePopulationShift: 3,
  /** An own port with a foreign armed ship within `homeRange`: the first priority, or the second if that ship is a frigate. */
  homeRange: 5,
  homePriority: 5,
  homeFrigatePriority: 8,
  /** Load = the power's land units / divisor, kept within least..most, plus 1 for each ship already sent to the station. */
  loadDivisor: 8,
  loadLeast: 3,
  loadMost: 99,
  /** A ship attacks only with a whole move in hand (thirds). */
  attackMovesLeast: 3,
  /** A privateer carries for its power only while more than `carryPorts` of its ports have a foreign frigate near, or those ports hold more than `carryPopulation` people. */
  carryPorts: 1,
  carryPopulation: 6,
  /** Ours: a power with this many colonies and no privateer buys one, keeping this much gold back. */
  privateerFromColonies: 4,
  privateerReserve: 1000,
} as const;

// Campaigns by land and sea of the computer powers (R-807), as traced from the original
// program; see docs/RULES.md "Computer powers: campaigns".
export const AI_CAMPAIGN = {
  /** A colony is worth a campaign when its population + the units on its square exceed sizeBase - turn / sizeTurnsPerStep. */
  sizeBase: 6,
  sizeTurnsPerStep: 50,
  /** A foreign colony is passed over on the turns when (its place in the list + the turn) is divisible by this. */
  restEvery: 4,
  /** Attack a foreign colony: at firm peace, and otherwise. */
  colonyPriorityAtPeace: 3,
  colonyPriority: 5,
  /** Attack a native settlement from this tribal alarm: where a mission stands, and where none does. */
  settlementAlarmFrom: 75,
  settlementPriority: 4,
  settlementPriorityNoMission: 2,
  /** Defend an own colony: the defenders it is short of plus this. */
  defendBase: 2,
  /** Invade: a beach within this many squares of the colony, when its owner has more colonies than us on the landmass and this many colonists there. */
  beachReach: 3,
  invadeColonistsFrom: 8,
  /** Priority: this, more against the human and at war, less on a landmass with more than one European colony to `crowdedPer` squares, doubled before turn `doubledBefore`. */
  invadePriority: 3,
  invadeHumanBonus: 1,
  invadeWarBonus: 1,
  crowdedPer: 16,
  crowdedPenalty: 1,
  doubledBefore: 150,
  /** A region is quiet when 20 x (its colonies of this power + its colonies of every power) exceed its size and nobody hostile is in it. */
  quietTimes: 20,
  /** On land an attack needs scaled odds of this: 8 x attack / (defence + 1), times three against a colony and two against a settlement. */
  oddsLeast: 12,
  oddsScale: 8,
  colonyTimes: 3,
  settlementTimes: 2,
  /** An attack is made only with a whole move in hand (thirds). */
  attackMovesLeast: 3,
  /** Soldiers and dragoons are not sent anywhere from a landmass where the power has fewer land units than this (or just this many and no colony). */
  companyLeast: 2,
  /** Ours: defenders a colony wants, and while the power is at war with another; soldiers armed beyond the garrison while an invasion is in view. */
  defendersWanted: 1,
  defendersAtWar: 2,
  expedition: 2,
} as const;
