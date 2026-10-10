// Numbers the computer powers plan by (R-802), tuned to give sensible play.
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
