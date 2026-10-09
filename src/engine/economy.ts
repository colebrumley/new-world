// A colony's production for one turn (R-301): what every worker makes, how raw materials are
// turned into finished goods, and what that does to the warehouse. Written from docs/RULES.md
// "Indoor production"; integer arithmetic throughout, in the order given there.
import { creditBells, type CongressEvent } from './congress';
import { warBells, type IndependenceEvent } from './independence';
import { customHouseSales, type CustomHouseEvent } from './custom-house';
import { dateOfTurn } from './calendar';
import { addGoods, amountOf } from './cargo';
import { withoutOne } from './colony';
import { completeConstruction, type ConstructionEvent } from './construction';
import { chainLevel } from './data/buildings';
import { CROSSES } from './data/crosses';
import { FOOD, HORSES } from './data/food';
import { ABSTRACT_GOOD_IDS, GOOD_IDS, HOLD_CAPACITY, type AbstractGoodId, type GoodId } from './data/goods';
import { CONVERSION_ORDER, PRODUCTION, TRADE_IDS, TRADES, type TradeId } from './data/production';
import { WAREHOUSE } from './data/pioneer';
import { DIFFICULTIES } from './data/yields';
import { educate, type EducationEvent } from './education';
import { centerOutput, fieldOutput } from './jobs';
import { colonyBells, solProductionTerm, updateLiberty, type LibertyEvent } from './liberty';
import { warehouseCapacity } from './pioneer';
import { createRng, type Rng } from './rng';
import { hasFather, type Colonist, type Colony, type GameState, type Goods, type Unit } from './state';

export type AnyGood = GoodId | AbstractGoodId;
export type Tally = Record<AnyGood, number>;

const ALL_GOODS: readonly AnyGood[] = [...GOOD_IDS, ...ABSTRACT_GOOD_IDS];

export function emptyTally(): Tally {
  return Object.fromEntries(ALL_GOODS.map((g) => [g, 0])) as Tally;
}

/** What a colonist of this kind makes indoors before bonuses. An expert outside his own trade works like a free colonist. */
export function baseOutput(profession: Colonist['profession']): number {
  if (profession === 'indenturedServant') return PRODUCTION.base.indenturedServant;
  if (profession === 'pettyCriminal') return PRODUCTION.base.pettyCriminal;
  if (profession === 'indianConvert') return PRODUCTION.base.indianConvert;
  return PRODUCTION.base.skilled;
}

export interface IndoorConditions {
  /** Levels built in the trade's chain: 1 house, 2 shop, 3 factory (for carpenters and preachers, 2 is the Lumber Mill / Cathedral). */
  readonly level: number;
  /** Sons of Liberty bonus less Tory penalty. */
  readonly sol: number;
  readonly hasPenn: boolean;
}

/** One indoor worker's output for a turn. */
export function indoorOutput(trade: TradeId, profession: Colonist['profession'], conditions: IndoorConditions): number {
  const def = TRADES[trade];
  const expert = def.expert === profession;
  const base = baseOutput(profession);
  let v: number;
  switch (def.rule) {
    case 'none':
      return 0;
    case 'craft':
      v = base + conditions.sol;
      if (conditions.level >= 2) v += base;
      if (conditions.level >= PRODUCTION.factoryLevel) v += Math.floor(v / 2);
      if (expert) v *= PRODUCTION.expertMultiplier;
      break;
    case 'flat':
      v = (expert ? PRODUCTION.flatExpert : base) + conditions.sol;
      if (conditions.level >= 2) v *= 2;
      if (trade === 'preacher' && conditions.hasPenn) v += Math.floor(v / 2);
      break;
    case 'plain':
      v = base + conditions.sol;
      if (expert) v *= PRODUCTION.expertMultiplier;
      break;
  }
  return Math.max(0, v);
}

export function workersIn(colony: Colony, trade: TradeId): Colonist[] {
  return colony.colonists.filter((c) => c.job.kind === 'work' && c.job.trade === trade);
}

/** How many may work at a trade in this colony: none without its building, else three (teachers by school level). */
export function tradeCapacity(colony: Colony, trade: TradeId): number {
  const level = chainLevel(colony.buildings, TRADES[trade].chain);
  if (level === 0) return 0;
  return trade === 'teacher' ? (PRODUCTION.teachers[level] ?? 0) : PRODUCTION.workersPerBuilding;
}

export interface ProductionReport {
  /** What the workers and the colony square would make with unlimited raw materials. */
  readonly potential: Tally;
  /** What is actually made after shortages. */
  readonly produced: Tally;
  /** Raw material used up as input, by good. */
  readonly consumed: Tally;
  /** Input each conversion wanted but could not get. */
  readonly shortfall: Tally;
  /** Net change to each storable good. */
  readonly delta: Record<GoodId, number>;
  /** Inputs that ran out and stopped a product entirely. */
  readonly ranOut: readonly GoodId[];
}

/** Everything a colony makes and uses in one turn, without changing anything. */
export function colonyProduction(state: GameState, colony: Colony): ProductionReport {
  const potential = emptyTally();
  const sol = solProductionTerm(state, colony);
  const hasPenn = hasFather(state, colony.owner, PRODUCTION.preacherFather);

  // fields and the colony square
  for (const c of colony.colonists) {
    if (c.job.kind !== 'field') continue;
    const good: GoodId = c.job.good === 'fish' ? 'food' : c.job.good;
    potential[good] += fieldOutput(state, colony, c.profession, c.job.dx, c.job.dy, c.job.good);
  }
  const center = centerOutput(state, colony);
  potential.food += center.food;
  if (center.secondary) potential[center.secondary.good === 'fish' ? 'food' : center.secondary.good] += center.secondary.amount;

  // workshops
  for (const trade of TRADE_IDS) {
    const def = TRADES[trade];
    if (!def.output) continue;
    const level = chainLevel(colony.buildings, def.chain);
    for (const c of workersIn(colony, trade)) potential[def.output] += indoorOutput(trade, c.profession, { level, sol, hasPenn });
  }

  // bells: the statesmen's work is topped up and multiplied for the colony as a whole
  potential.bells = colonyBells(state, colony, potential.bells);
  // crosses: a colony makes one by itself, one more with a Church and another with a Cathedral
  potential.crosses += CROSSES.perColony + CROSSES.perChurchLevel * chainLevel(colony.buildings, 'church');

  // settle the conversions in chain order against stock plus this turn's make
  const produced: Tally = { ...potential };
  const consumed = emptyTally();
  const shortfall = emptyTally();
  const ranOut: GoodId[] = [];
  for (const trade of CONVERSION_ORDER) {
    const def = TRADES[trade];
    const input = def.input as GoodId;
    const output = def.output as AnyGood;
    const want = potential[output];
    if (want === 0) continue;
    const factory = chainLevel(colony.buildings, def.chain) >= PRODUCTION.factoryLevel && def.rule === 'craft';
    const need = factory ? Math.floor((want * PRODUCTION.factoryInput[0]) / PRODUCTION.factoryInput[1]) : want;
    const available = amountOf(colony.goods, input) + produced[input] - consumed[input];
    const short = Math.max(0, need - available);
    let lost = short;
    if (factory && short > 0) lost = available <= 0 ? want : Math.min(want, Math.floor((short * PRODUCTION.factoryInput[1]) / PRODUCTION.factoryInput[0]));
    produced[output] = want - Math.min(want, lost);
    consumed[input] += Math.min(need, Math.max(0, available));
    shortfall[input] += short;
    if (short > 0 && produced[output] === 0) ranOut.push(input);
  }

  // food: everyone eats, and horses breed on what is left of this turn's harvest
  const eaten = FOOD.perColonist * colony.colonists.length;
  const surplus = Math.max(0, produced.food - eaten);
  const herd = amountOf(colony.goods, 'horses');
  if (herd >= HORSES.minimumHerd) {
    const size = colony.buildings.includes(HORSES.stable) ? HORSES.herdSizeWithStable : HORSES.herdSize;
    potential.horses = HORSES.perHerd * Math.ceil(herd / size);
    const room = Math.max(0, warehouseCapacity(colony) - herd);
    produced.horses = Math.min(potential.horses, Math.ceil(surplus / HORSES.surplusPerHorse), room);
  }
  consumed.food = eaten + produced.horses;
  shortfall.food = Math.max(0, consumed.food - produced.food - amountOf(colony.goods, 'food'));

  const delta = Object.fromEntries(GOOD_IDS.map((g) => [g, produced[g] - consumed[g]])) as Record<GoodId, number>;
  return { potential, produced, consumed, shortfall, delta, ranOut };
}

/** Apply a turn's net changes to the warehouse (never below zero). */
export function applyDelta(goods: Goods, delta: Readonly<Record<GoodId, number>>): Goods {
  const next: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    const amount = Math.max(0, amountOf(goods, good) + delta[good]);
    if (amount > 0) next[good] = amount;
  }
  return next;
}

export type EconomyEvent =
  | CongressEvent
  | IndependenceEvent
  | CustomHouseEvent
  | ConstructionEvent
  | LibertyEvent
  | EducationEvent
  | { readonly type: 'colonyProduced'; readonly colonyId: string; readonly delta: Goods; readonly hammers: number }
  | { readonly type: 'ranOutOf'; readonly colonyId: string; readonly good: GoodId }
  /** The store will not last long at this rate. */
  | { readonly type: 'foodLow'; readonly colonyId: string; readonly turnsLeft: number }
  /** The last of the food was eaten this turn; next turn someone starves. */
  | { readonly type: 'foodDepleted'; readonly colonyId: string }
  | { readonly type: 'colonistStarved'; readonly colonyId: string; readonly colonistId: string }
  /** The last colonist starved and the colony is gone, stores and all. */
  | { readonly type: 'colonyVanished'; readonly colonyId: string; readonly name: string; readonly lost: Goods }
  /** Goods over the warehouse limit were thrown away. `reported` is the part worth telling the player about. */
  | { readonly type: 'goodsSpoiled'; readonly colonyId: string; readonly lost: Goods; readonly reported: Goods; readonly canExpand: boolean }
  /** A good passed another full hundred in store. `full` when it now fills the warehouse. */
  | { readonly type: 'cargoReady'; readonly colonyId: string; readonly good: GoodId; readonly amount: number; readonly full: boolean; readonly canExpand: boolean }
  | { readonly type: 'colonistBorn'; readonly colonyId: string; readonly unitId: string; readonly food: number };

/** Does a death that is due actually happen? The two easiest levels are merciful. */
function starvationStrikes(state: GameState, rng: Rng): boolean {
  const odds = (FOOD.mercyOdds as Partial<Record<string, number>>)[state.difficulty];
  if (odds === undefined) return true;
  if (dateOfTurn(state.turn).year < FOOD.mercyUntilYear) return false;
  return rng.int(1, odds) === 1;
}

/** One colony's turn: make, convert, eat, store; then growth, starvation and construction. */
export function colonyTurn(state: GameState, colonyId: string, events: EconomyEvent[]): GameState {
  const colony = state.colonies[colonyId];
  if (!colony) return state;
  const ai = state.players.find((p) => p.id === colony.owner)?.kind === 'ai';
  const report = colonyProduction(state, colony);
  const delta = { ...report.delta };
  // AI colonies get a little food for nothing on the harder levels
  if (ai) delta.food += Math.floor(DIFFICULTIES.indexOf(state.difficulty) / 2);
  const hadFood = amountOf(colony.goods, 'food');
  const hungry = Math.max(0, -(hadFood + delta.food));
  let goods = applyDelta(colony.goods, delta);
  const changed: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    const diff = amountOf(goods, good) - amountOf(colony.goods, good);
    if (diff !== 0) changed[good] = diff;
  }
  events.push({ type: 'colonyProduced', colonyId, delta: changed, hammers: report.produced.hammers });
  for (const good of report.ranOut) events.push({ type: 'ranOutOf', colonyId, good });

  let next: GameState = state;
  let colonists = colony.colonists;

  // the bells rung this turn move membership, and bells and crosses are added to the power's totals
  const liberty: LibertyEvent[] = [];
  const stirred = updateLiberty(state, colony, report.produced.bells, liberty);
  events.push(...liberty);
  let sol = stirred.sol;

  // school is in session, and hands in the fields may pick up a trade
  const schooling: EducationEvent[] = [];
  const schooled = educate(next, colonyId, schooling);
  events.push(...schooling);
  colonists = schooled.colonies[colonyId]?.colonists ?? colonists;
  next = { ...next, rng: schooled.rng };
  next = { ...next, players: next.players.map((p) => (p.id === colony.owner ? { ...p, bells: p.bells + report.produced.bells, crosses: p.crosses + report.produced.crosses } : p)) };
  // the same bells go before the Continental Congress
  const congress: CongressEvent[] = [];
  next = creditBells(next, colony.owner, report.produced.bells, congress);
  events.push(...congress);
  // after the Declaration they speak to the powers of Europe instead
  next = warBells(next, colony.owner, report.produced.bells, events);

  // growth: a full larder becomes a new free colonist standing outside the colony
  if (amountOf(goods, 'food') >= FOOD.growthAt) {
    goods = addGoods(goods, 'food', -FOOD.growthAt);
    const id = `u${next.nextId}`;
    const born: Unit = {
      id, owner: colony.owner, type: 'colonist', profession: 'freeColonist', x: colony.x, y: colony.y, movesLeft: 0,
      orders: 'none', destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
    };
    next = { ...next, nextId: next.nextId + 1, units: { ...next.units, [id]: born } };
    events.push({ type: 'colonistBorn', colonyId, unitId: id, food: FOOD.growthAt });
  }

  // hunger
  const deficit = report.consumed.food - report.produced.food;
  if (hungry > 0 && !(ai && hungry < FOOD.aiIgnoredShortfall)) {
    if (hadFood > 0) {
      events.push({ type: 'foodDepleted', colonyId });
    } else {
      const rng = createRng(next.rng);
      const strikes = starvationStrikes(next, rng);
      const victim = rng.pick(colonists);
      next = { ...next, rng: rng.state() };
      if (strikes) {
        events.push({ type: 'colonistStarved', colonyId, colonistId: victim.id });
        colonists = colonists.filter((c) => c.id !== victim.id);
        sol = withoutOne(sol);
        if (colonists.length === 0) {
          events.push({ type: 'colonyVanished', colonyId, name: colony.name, lost: goods });
          const { [colonyId]: _gone, ...rest } = next.colonies;
          const tiles = [...next.map.tiles];
          const i = colony.y * next.map.width + colony.x;
          tiles[i] = { ...(tiles[i] as (typeof tiles)[number]), claim: null };
          return { ...next, colonies: rest, map: { ...next.map, tiles } };
        }
      }
    }
  } else if (hungry === 0 && deficit > 0 && amountOf(goods, 'food') < FOOD.lowWarningTurns * deficit) {
    events.push({ type: 'foodLow', colonyId, turnsLeft: Math.floor(amountOf(goods, 'food') / deficit) });
  }

  const updated: Colony = {
    ...colony, goods, colonists, hammers: colony.hammers + report.produced.hammers,
    sol, solLevel: stirred.solLevel, toryNoticed: stirred.toryNoticed,
  };
  const stocked: GameState = { ...next, colonies: { ...next.colonies, [colonyId]: updated } };
  const built: ConstructionEvent[] = [];
  const after = completeConstruction(stocked, colonyId, built);
  events.push(...built);
  const sales: CustomHouseEvent[] = [];
  const exported = customHouseSales(after, colonyId, sales);
  events.push(...sales);
  return trimWarehouse(exported, colonyId, colony.goods, changed, events);
}

/**
 * Last step of a colony's turn: everything but food is cut back to what the warehouse holds.
 * Excess that is no more than this turn's own gain goes quietly; excess that was already
 * there (cargo unloaded over the limit, say) is reported. Then goods that passed a full
 * hundred this turn are announced as ready to ship.
 */
function trimWarehouse(state: GameState, colonyId: string, before: Goods, gained: Goods, events: EconomyEvent[]): GameState {
  const colony = state.colonies[colonyId];
  if (!colony) return state;
  const capacity = warehouseCapacity(colony);
  const canExpand = capacity < WAREHOUSE.base + WAREHOUSE.step * WAREHOUSE.buildings.length;
  let goods = colony.goods;
  const lost: Partial<Record<GoodId, number>> = {};
  const reported: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    if (good === 'food') continue;
    const over = amountOf(goods, good) - capacity;
    if (over <= 0) continue;
    const quiet = Math.min(over, Math.max(0, amountOf(gained, good)));
    const rest = over - quiet;
    // a single unit of old excess is let be
    const removed = rest === 1 ? quiet : over;
    if (removed > 0) {
      goods = addGoods(goods, good, -removed);
      lost[good] = removed;
    }
    if (rest > 1) reported[good] = rest;
  }
  if (Object.keys(lost).length > 0) events.push({ type: 'goodsSpoiled', colonyId, lost, reported, canExpand });
  for (const good of GOOD_IDS) {
    if (good === 'food') continue;
    const now = amountOf(goods, good);
    if (Math.floor(amountOf(before, good) / HOLD_CAPACITY) < Math.floor(now / HOLD_CAPACITY)) {
      events.push({ type: 'cargoReady', colonyId, good, amount: now, full: now >= capacity, canExpand });
    }
  }
  return goods === colony.goods ? state : { ...state, colonies: { ...state.colonies, [colonyId]: { ...colony, goods } } };
}
