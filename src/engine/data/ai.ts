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
  /** It keeps one soldier for every so many colonies, and this many more while a native people is hostile to it; they are armed on the docks. */
  coloniesPerGuard: 1,
  reprisalParty: 4,
  /** A soldier who can be spared marches on a settlement of a people at war with us if it lies within this many squares. */
  reprisalRange: 12,
  /** ...and it treats a people as an enemy from this attitude level up (2 angry, 3 at war): once fighting starts it is seen through. */
  reprisalFromLevel: 2,
  /** A militaristic leader campaigns against the native peoples unprovoked from this turn on (1650), until he has destroyed this many settlements. */
  conquestFromTurn: 208,
  conquestQuota: 4,
  /** An attack is made only at this chance of winning or better, percent. */
  attackOddsLeast: 60,
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
