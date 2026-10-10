// Numbers the computer powers plan by (R-802): site choice, the first colony, and a few limits.
export const AI_PLAN = {
  /** A ship or a party weighs a site's worth against this much for every square it lies off. */
  sitePerSquare: 4,
  /** Until its first colony stands, a power counts each square of distance to a site this many times over. */
  firstColonyHaste: 6,
  /** From this turn a power still without a colony founds one wherever its settlers stand, if the ground allows. */
  firstColonyAnywhereFrom: 6,
  /** How far a ship, and a party on foot, look for a site. */
  shipSearch: 14,
  landSearch: 7,
  /** A power thinks of landings abroad only once it has this many colonies. */
  coloniesBeforeGarrison: 2,
  /** A ship tries this many anchorages beside a site before giving it up for the turn. */
  berthsTried: 3,
  /** Gold kept back when paying a recruit's passage. */
  goldReserve: 200,
  /** A power's turn is cut off after this many actions. */
  actionsPerTurn: 250,
} as const;

// Wagon trains and trade with the native peoples by computer powers (R-804);
// see docs/RULES.md "Computer powers: wagon trains".
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

// Missionaries of the computer powers and what their units do at a native settlement (R-805);
// see docs/RULES.md "Computer powers: missions".
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

// Warships and privateers of the computer powers (R-806);
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
} as const;

// Campaigns by land and sea of the computer powers (R-807);
// see docs/RULES.md "Computer powers: campaigns".
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
  /** A landing to settle (beside a rival with fewer than that many colonists on land where the power has no colony, or beside a native settlement on such land) starts from this. */
  settlePriority: 2,
  invadeHumanBonus: 1,
  /** ...and one more for each of these sizes his landmass reaches, where every European colony on it is his. */
  invadeAloneFrom: [16, 64],
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
  /** ...times the cost of the units there a head (and one) over the attacker's own cost; threefold again for an attacking arm on land that is to be taken; never over `oddsMost`. */
  contestedTimes: 3,
  oddsMost: 1000,
  /** A human's colony on a square the power has not seen is not marched on or blockaded while level x turn is no more than the first; no colony unseen is landed beside while it is no more than the second. */
  unseenHumanUntil: 180,
  unseenUntil: 200,
  /** An attack is made only with a whole move in hand (thirds). */
  attackMovesLeast: 3,
  /** Soldiers and dragoons are not sent anywhere from a landmass where the power has fewer land units than this (or just this many and no colony). */
  companyLeast: 2,
} as const;

// Gold and purchases of the computer powers in Europe;
// see docs/RULES.md "Computer powers: the treasury and the fleet".
export const AI_FLEET = {
  /** Each turn from `subsidyFromTurn` a power is given `subsidyTimes` x level x ((year - `subsidyBaseYear`) / `subsidyYears` + its colonies) gold... */
  subsidyFromTurn: 20,
  subsidyBaseYear: 1500,
  subsidyYears: 50,
  subsidyTimes: 4,
  /** ...doubled from this year, and scaled by these halves at each difficulty level (so half again on the fourth, doubled on the fifth). */
  subsidyDoubledFrom: 1700,
  subsidyHalves: [2, 2, 2, 3, 4],
  /** A foreign warship this near one of its colonies besets it. */
  besetRange: 5,
  /** The others' naval threat: their privateers plus this many times their frigates, over `threatDivisor`. */
  threatPerFrigate: 4,
  threatDivisor: 4,
  /** It answers the human's frigate when it has none of its own, and the human's privateers while it has fewer than this. */
  privateersAnswering: 2,
  /** Without colonies enough beset, it still answers once the turn is past the first number and it holds the second in gold: for a frigate, and for a privateer. */
  frigateLate: [200, 2000],
  privateerLate: [100, 1000],
  /** The ordinary round of buying: a frigate while it has fewer warships than this, on one throw in `frigateOdds`... */
  frigateWarshipsBelow: 8,
  frigateOdds: 2,
  /** ...a galleon on all but one throw in this many... */
  galleonOdds: 4,
  /** ...a merchantman on one throw in `merchantmanOdds` while its holds are fewer than this... */
  merchantmanHoldsBelow: 12,
  merchantmanOdds: 2,
  /** ...a caravel while its holds are no more than this... */
  caravelHoldsMost: 2,
  /** ...and a privateer while it has fewer warships than this, on one throw in `privateerOdds`. */
  privateerWarshipsBelow: 4,
  privateerOdds: 4,
  /** Artillery, on one throw in this many, when its holds are more than the second number. */
  artilleryOdds: 4,
  artilleryHoldsOver: 4,
} as const;

// How a computer power runs a colony: who works at what, and what it builds;
// see docs/RULES.md "Computer powers: the colony".
export const AI_COLONY = {
  /** A food square is kept only if it yields this much while the colony is short of food, or the second otherwise. */
  yieldLeastShort: 3,
  yieldLeast: 5,
  /** "Short" needs the shortfall times this to reach the food in store. */
  shortTimes: 16,
  /** A lumberjack is put on while the colony holds less lumber than this; a carpenter once it has this much, counting the turn's. */
  lumberjackBelow: 10,
  carpenterFrom: 2,
  /** With nobody felling and under `giftBelow` lumber, on turns divisible by `giftEvery` the colony is given `gift` lumber, for `giftGold` if the treasury has it. */
  giftBelow: 2,
  giftEvery: 8,
  gift: 100,
  giftGold: 200,
  /** Building: a stable from this many horses; nothing beyond the first three choices under `smallBelow` people, nor beyond the middle of the list under `mediumBelow`. */
  stableHorses: 2,
  smallBelow: 4,
  mediumBelow: 8,
  /** A warehouse level is wanted for every this many people. */
  peoplePerWarehouse: 6,
  /** Custom house from this population when ships threaten or the human leads at sea by more than `customLead` warships; from the second anyway. */
  customFrom: 6,
  customLead: 2,
  customAnywayFrom: 12,
  /** Schools: population + experts needed for a schoolhouse, a college, a university. */
  schoolFrom: [4, 10, 16],
  /** Armory: population, the musket price level (plus half the difficulty level) or the turn after which it is wanted, and the tools it must hold. */
  armoryFrom: 6,
  armoryPrice: 4,
  armoryAfterTurn: 80,
  armoryTools: 40,
  /** Blacksmith's shop: population, the musket price level, the ore it must hold. */
  smithFrom: 4,
  smithPrice: 4,
  smithOre: 40,
  /** Newspaper from this many bells a turn; fortress from this population. */
  newspaperBells: 4,
  fortressFrom: 10,
  /** A processing chain goes to its second level when the colony makes this much of the product, to its third at the next figure or with this much in store. */
  chainSecond: 3,
  chainThird: 8,
  chainStock: 100,
  /** Artillery is built while fewer than this many pieces stand in the colony. */
  artilleryBelow: 3,
} as const;

// How a computer power's colony sees to its own defence and its own numbers;
// see docs/RULES.md "Computer powers: arming and taking in colonists".
export const AI_MUSTER = {
  /** Threat: foreign land units within this many squares count their attack value x (falloff - distance) / falloff... */
  threatRange: 5,
  threatFalloff: 8,
  /** ...braves only from this tribal alarm and this alarm in their own village... */
  tribeAlarmFrom: 25,
  villageAlarmFrom: 128,
  /** ...the sum divided by the colony's walls plus one, but never below itself up to this; a defender is wanted for every so much. */
  threatFloor: 16,
  threatPerDefender: 8,
  /** Troops within this many squares, on the same landmass, belong to the colony nearest them. */
  ownRange: 8,
  /** Beyond those, more are wanted: (3 x people / 2 - bent - turn / `turnsPerStep` + quiet or defended bonus) / (bent + `divisor`, one more while the first want is unmet, one less where the land is to be taken). */
  turnsPerStep: 128,
  divisor: 5,
  quietBonus: 2,
  defendedBonus: 1,
  /** With rival Europeans on a landmass that has native settlements, no more than this many extra. */
  extraMostAmongRivals: 1,
  /** ...except for this nation, which is not held to that. */
  unbounded: 'spain',
  /** A soldier takes this many muskets; he rides as a dragoon when the colony has `dragoonHorses`; a scout goes out from `scoutHorses`. */
  muskets: 50,
  dragoonHorses: 52,
  scoutHorses: 102,
  /** A scout only from a colony of this many, or one at its cap. */
  scoutFrom: 10,
  /** Now and then (one turn in `oftenOdds`) a quiet colony of more than `spareOver` sends someone out anyway. */
  spareOver: 10,
  oftenOdds: 4,
  pioneerTools: 20,
  /** Who goes: the veteran (or other expert of the calling) before criminals, servants, free colonists, and last the skilled. */
  rank: { expert: 4, pettyCriminal: 3, indenturedServant: 2, freeColonist: 1 },
  /** A colony wants colonists under `cap + 2 x hall` people while its people less `2 x hall` are fewer than its land squares, or under `idleBelow` when it has nothing to build; never from `most`. */
  cap: 8,
  hall: 2,
  idleBelow: 10,
  most: 32,
  /** A colonist joins only while the colony's people and the units standing in it are fewer than `cap + joinOver`. */
  joinOver: 2,
} as const;

// Whether a computer power's colonist founds a colony or joins one;
// see docs/RULES.md "Computer powers: founding and joining".
export const AI_SETTLE = {
  /** No more colonies are founded once the world holds this many. */
  coloniesInAll: 48,
  /** Colonies still wanted when the power has none, or none of its colonies wants colonists. */
  wantedWhenFull: 8,
  /** Otherwise: a colony for every (this - bent) people beyond one each, moved half way to half the fleet's holds... */
  peoplePerColony: 4,
  /** ...less (least - average + 1) for each colony while the average colony is under `sizeLeast` - `sizePerBent` x bent. */
  sizeLeast: 7,
  sizePerBent: 3,
  /** A landmass has room for a site to every so many squares; bonuses where no European has settled, and where the power has not. */
  squaresPerSite: 12,
  emptyBonus: 2,
  newLandBonus: 4,
  /** Willingness: +2 on land where the power has no colony, else distance to its nearest / 5 - 1... */
  newLandWilling: 2,
  distancePerStep: 5,
  /** ...by what the unit is... */
  pioneer: 2,
  soldier: -2,
  dragoon: -3,
  colonist: -2,
  skilled: -2,
  convert: -20,
  /** ...and +1 for every 16 turns since the power last founded, while it wants colonies. */
  turnsShift: 4,
  /** Choosing a port for passengers: (17 - population, 16 at most) squared counts fourfold; these for a landmass shared with the human, and for wanting colonists (against, when it does not); luck up to the last. */
  portSizeFrom: 17,
  portSharedBonus: 20,
  portWantsBonus: 25,
  portLuck: 8,
} as const;

// What a computer power's colonies get by themselves each turn;
// see docs/RULES.md "Computer powers: upkeep of a colony".
export const AI_UPKEEP = {
  /** With fewer tools than this, the colony buys this many at their price level each, when it has land to improve or on every `toolsEvery`th turn. */
  tools: 20,
  toolsEvery: 10,
  /** Land is improved for that many tools, except on every `restEvery`th turn, once the colony has waited the turns the work takes plus `waitExtra` (and `clearExtra` for clearing forest). */
  restEvery: 7,
  waitExtra: 2,
  clearExtra: 2,
  waitMost: 127,
  /** Farmland is good from this food yield (by the terrain table) and poor under the second. */
  goodFarm: 3,
  poorFarm: 2,
  /** Native ground loses (this - the tribe's alarm), reckoned double with under `nativeGold` in the treasury and half with more. */
  nativeCalm: 4,
  nativeGold: 2000,
  /** On every `restEvery`th turn, instead, a stretch of road toward another of the power's colonies within this many squares east-west or north-south. */
  sisterWithin: 7,
  /** An unskilled carpenter in a colony of this many becomes a master one turn in (`masterOdds` - difficulty level). */
  masterFrom: 6,
  masterOdds: 17,
  /** A school trains one colonist after this many turns' wait, by its level. */
  schoolWait: [4, 8, 16],
  /** A colony under this many, with no more experts on food than people feeding it, is given a fisherman or a farmer. */
  schoolFoodBelow: 10,
  /** Otherwise, for each workshop chain at this level or above that has stuff to work and no master... */
  schoolChains: [
    { chain: 'armory', levels: 1, input: 'tools', master: 'masterGunsmith' }, { chain: 'blacksmith', levels: 2, input: 'ore', master: 'masterBlacksmith' },
    { chain: 'furTrader', levels: 2, input: 'furs', master: 'masterFurTrader' }, { chain: 'distiller', levels: 2, input: 'sugar', master: 'masterDistiller' },
    { chain: 'tobacconist', levels: 2, input: 'tobacco', master: 'masterTobacconist' }, { chain: 'weaver', levels: 2, input: 'cotton', master: 'masterWeaver' },
  ],
  /** ...the pupil is given the trade at the same place in this list (the last chain that applies deciding). */
  schoolPupils: ['expertFarmer', 'masterSugarPlanter', 'masterTobaccoPlanter', 'masterCottonPlanter', 'expertFurTrapper', 'expertLumberjack'],
  /** Paid training only while the tax rate is no more than this and the treasury holds a farmer's training price; each one trained raises the tax rate by one, up to `taxMost`. */
  trainTaxMost: 25,
  taxMost: 75,
  /** From this turn a colony with fewer horses than this, with a ship or wagon in it, has them made up for this much gold. */
  horses: 2,
  horsesFromTurn: 40,
  horsesGold: 10,
} as const;

// Supplies a computer power ships to its colonies; see
// docs/RULES.md "Computer powers: supplies by ship".
export const AI_SUPPLY = {
  /** The supplies: the goods a colony can ask for, and that a ship carries to a port rather than home. */
  goods: ['muskets', 'tools', 'tradeGoods', 'horses'],
  /** A colony asks for muskets under this many x (its leader's aggression + `musketLotsBase`), and at once under this many while it is short of defenders. */
  muskets: 50,
  musketLotsBase: 2,
  /** It asks for horses under this many, and for tools under this many while it has land to improve. */
  horses: 50,
  tools: 20,
  /** A lot bought in Europe; every `cargoEvery`th turn is a cargo turn, when nobody is fitted out and goods are bought whether asked for or not. */
  lot: 100,
  cargoEvery: 3,
  /** Holds kept free on a turn when somebody was fitted out. */
  holdsKept: 2,
  /** The good a port asks for counts this much toward a ship's choosing it. */
  askedBonus: 32,
} as const;

// A computer power's business on the docks in Europe; see
// docs/RULES.md "Computer powers: on the docks".
export const AI_DOCKS = {
  /** It recruits only while the colonies wanting colonists, less its colonists afoot, are at least its colonies / this... */
  recruitColoniesShift: 1,
  /** ...and it holds the fare and 2 x (this x its people - the turn) besides. */
  reservePerPerson: 30,
  reserveTimes: 2,
  /** A colonist is armed on one throw in (2, or 3 if skilled) while muskets are wanted; from `lateFrom` also on one in (3, or 4) while colonies are wanted. */
  soldierOdds: 2,
  lateOdds: 3,
  lateFrom: 100,
  /** A pioneer on one throw in this many while colonies wanted outnumber its pioneers (a skilled man on one in `skilledPioneerOdds` besides); from `lateFrom` only with fewer pioneers than a throw of 0..`pioneersMost`. */
  pioneerOdds: 3,
  skilledPioneerOdds: 5,
  pioneersMost: 2,
} as const;

// Arms a computer power keeps in Europe; see docs/RULES.md
// "Computer powers: on the docks".
export const AI_RESERVE = {
  /** Muskets are kept by the lot of this many; a soldier takes one lot, a dragoon this many horses besides. */
  lot: 50,
  /** A colony with nothing more wanted for its defence and this many muskets sends a lot to the reserve, while it holds fewer than `lotsMost`. */
  colonyMuskets: 200,
  lotsMost: 20,
  /** After this turn the two are levelled, a lot for 50 horses, to within one lot of each other. */
  levelAfterTurn: 80,
  /** A computer power's fare is `priceStep` x (recruits paid for - level + offset), less its crosses' share, with no floor; a dragoon's is by half the level, and from `discountFrom` a tenth off for each level. */
  discountFrom: 100,
  /** The second artillery: for a power whose largest ship in port has this many holds, from this turn. */
  artilleryHolds: 6,
  artilleryFromTurn: 40,
  /** That gun costs (this - level) x `artilleryPriceTimes`. */
  artilleryPriceBase: 10,
  artilleryPriceTimes: 100,
} as const;

// What a computer power's ships load in its colonies and where empty ones go;
// see docs/RULES.md "Computer powers: freight".
export const AI_FREIGHT = {
  /** A computer colony's Custom House sells every good but these, and ore only from a colony with no armory that makes no tools or muskets. */
  customHouseKeeps: ['food', 'lumber', 'horses', 'tools', 'muskets'],
  /** Goods a ship never loads in a colony. */
  neverLoaded: ['lumber', 'food', 'tradeGoods'],
  /** Tools and muskets only from a colony that makes them, and only beyond this many. */
  madeKept: 100,
  /** A good the warehouse is full of counts this many times over; horses count only as stock + this - capacity - 2. */
  fullTimes: 2,
  horsesMargin: 25,
  /** A port is worth a call for a good at this many or more; a pioneer waiting counts this much, a spare troop that much. */
  readyFrom: 75,
  pioneerValue: 800,
  troopValue: 1500,
  /** A frigate carries goods only while the fleet's holds, less this many for each frigate and one for each privateer, are under the second number. */
  frigateHolds: 3,
  transportsEnough: 4,
  /** A ship smaller than a galleon, in a port of its power with a foreign frigate within `blockadeRange`, lies there until she has waited `blockadeWait` less her holds turns. */
  blockadeRange: 5,
  blockadeWait: 10,
  blockadeHolds: ['caravel', 'merchantman'],
  /** A ship with nothing to fetch, not the Europe ship, sails for Europe one turn in this many. */
  homeEvery: 32,
} as const;

// How a computer colony weighs one job against another; see docs/RULES.md "Computer powers:
// the colony".
export const AI_JOBS = {
  /** A square scores `yieldTimes` x its yield + `nearness` - its distance, times a weight for the crop. */
  yieldTimes: 8,
  nearness: 7,
  /** Food and fish weigh this in a colony of under sixteen, nothing in a larger one; other crops their price level. */
  foodWeight: 4,
  /** While a colony short of food is being fed, a food square counts this many times over (fish `fishFirst` more beforehand), less the worth of its terrain; while it is fed and not short, food counts for nothing. */
  starvingTimes: 32,
  fishFirst: 8,
  /** Ore weighs this much more in a colony of [people] from [turn], and more again with smithies and an armory. */
  oreBonus: 2,
  oreFrom: [8, 80],
  /** Crops that a workshop works up weigh this much more. */
  worked: ['sugar', 'tobacco', 'cotton', 'furs', 'ore'],
  workedBonus: 2,
  /** A bench scores (`yieldTimes` x what it would make + this) x its weight. */
  benchBase: 5,
  /** Weights: tools and muskets their price level + this, doubled from turn `armsDoubledFrom` for a power not behind the human. */
  armsBonus: 4,
  armsDoubledFrom: 50,
  /** A carpenter this less a third of the hammers made; a preacher this less half the crosses made and a hundredth of the turn. */
  carpenter: 5,
  preacher: 9,
  /** A statesman this + the colony's Tories + `bellsPerPress` for each level of printing press; doubled with `toriesMany` Tories; nothing before `bellsFromYear`; doubled after each of these years; halved under each of these sizes. */
  bells: 7,
  bellsPerPress: 4,
  toriesMany: 10,
  bellsFromYear: 1540,
  bellsDoubledAfter: [1600, 1700],
  bellsHalvedUnder: [4, 6],
} as const;

// When a computer power makes up its mind to fight a native people; see docs/RULES.md
// "Computer powers: campaigns".
export const AI_NATIVE_WAR = {
  /** Strength is a unit's defence (the power's) or attack (a brave's) times this, summed and capped. */
  strengthPer: 8,
  cap: 255,
  /** It needs this much strength in the field on that land... */
  fieldLeast: 2,
  /** ...the people's whole strength no more than this many times its own, and their strength on that land under this many times its field strength. */
  totalTimes: 2,
  fieldTimes: 4,
  /** And the people's alarm toward it above this. */
  alarmOver: 25,
} as const;

// How a square is rated as a place for a colony, and what a settler makes of it; see
// docs/RULES.md "Computer powers: founding and joining".
export const AI_SITE = {
  /** Weights of the squares of the cross: beside the centre, at its corners, two away in a line, a knight's move away, and the centre itself. */
  weights: { beside: 9, corner: 6, two: 4, knight: 3, centre: 4 },
  /** The weighted sum over this, and no more than `ratingMost`. */
  ratingDivisor: 10,
  ratingMost: 15,
  /** Within this many squares of one of its own colonies a site loses (this - distance) squared; of a rival's, by `rivalClear` (`rivalClearNewLand` on land the power has not settled), and `rivalBeside` more two squares from it. */
  ownClear: 9,
  rivalClear: 7,
  rivalClearNewLand: 5,
  rivalBeside: 20,
  /** A native settlement within this many squares costs half a measure, and a whole, two, four and eight measures more within each of these; a measure is 2 x (the tribe's level + its alarm level + 3). */
  villageWithin: 6,
  villageSteps: [4, 3, 2, 1],
  /** The French take half of that to heart, the Spanish a quarter. */
  villageEase: { france: 2, spain: 4 },
  /** A site rated this or more is worth half again on land new to the power, and double to a plain colonist. */
  goodFrom: 4,
} as const;

// How a computer power's scout picks each step, and what its pioneers do in the field; see
// docs/RULES.md "Computer powers: founding and joining".
export const AI_SCOUT = {
  /** Each neighbouring square scores a throw of 1 to this... */
  chance: 8,
  /** ...this much more from river to river (straight on, not across a corner), else this much from road to road, else this many times the ground's movement cost less. */
  river: 2,
  road: 1,
  costTimes: 3,
  /** Looking this many squares on in that direction: land with none of its own people about counts this much, and each unseen land square round it (less for each occupied one) the last. */
  ahead: 4,
  emptyAhead: 8,
  unseen: 2,
  /** Turning from the way it last went costs this times the square of the turn (in eighths of a circle, four at most). */
  turning: 2,
} as const;

export const AI_PIONEER = {
  /** A pioneer lays no road within a native settlement's land (this far, by the tribe's level) while the tribe's alarm is under `alarmFrom`, nor within `rivalWithin` squares of a rival's colony when that is the nearest. */
  tribeLand: [1, 1, 2, 3],
  alarmFrom: 75,
  rivalWithin: 3,
} as const;
