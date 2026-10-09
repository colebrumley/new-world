// How a computer power runs a colony (docs/RULES.md "Computer powers: the colony"): every turn
// the jobs are dealt out afresh in a fixed order (food, a lumberjack, a carpenter, experts to
// their trades, everyone else to whatever pays best) and the thing to build is chosen from a
// fixed list. Nothing is remembered: both are worked out from the colony as it stands.
import { validateAction, type Action } from '../engine/actions';
import { NEIGHBORS, coloniesOf } from '../engine/colony';
import { availableItems, isPortColony, itemCost, sameItem } from '../engine/construction';
import { AI_COLONY, AI_FLEET, AI_PLAN } from '../engine/data/ai';
import { BUILDING_CHAINS, BUILDINGS, chainLevel, type BuildingChain, type BuildingId } from '../engine/data/buildings';
import type { GoodId } from '../engine/data/goods';
import { TRADE_IDS, TRADES, type TradeId } from '../engine/data/production';
import { PROFESSIONS, UNSKILLED } from '../engine/data/professions';
import type { RawGood } from '../engine/data/terrain';
import { UNIT_TYPES } from '../engine/data/units';
import { DIFFICULTIES } from '../engine/data/yields';
import { colonyProduction, tradeCapacity, workersIn } from '../engine/economy';
import { fleetCensus, fleetWants } from '../engine/fleet';
import { fieldOutput, squareStatus } from '../engine/jobs';
import { priceLevel } from '../engine/market';
import { warehouseCapacity } from '../engine/pioneer';
import { suggestPlacement } from '../engine/placement';
import { tileAt, type BuildItem, type Colonist, type Colony, type GameState, type Job } from '../engine/state';
import { isWater } from '../engine/tile';
import { memo } from './campaign';
import { wagonRefusal } from './wagons';

const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;
const IDLE: Job = { kind: 'idle' };
const sameJob = (a: Job, b: Job): boolean =>
  a.kind === b.kind && (a.kind === 'idle' || (a.kind === 'work' && b.kind === 'work' && a.trade === b.trade) || (a.kind === 'field' && b.kind === 'field' && a.dx === b.dx && a.dy === b.dy && a.good === b.good));
const skilled = (c: Colonist): boolean => !UNSKILLED.includes(c.profession);
const stored = (good: RawGood): GoodId => (good === 'fish' ? 'food' : good);
const stock = (colony: Colony, good: GoodId): number => colony.goods[good] ?? 0;
/** The trade a colonist is the expert of, if it is one worked indoors. */
const ownTrade = (c: Colonist): TradeId | null => TRADE_IDS.find((t) => TRADES[t].expert === c.profession) ?? null;

/** Hammers the colony's project still wants; 0 with nothing on the stocks or no workshop. */
const hammersWanted = (colony: Colony): number =>
  colony.construction === null || !colony.buildings.includes('carpentersShop') ? 0 : Math.max(0, itemCost(colony.construction).hammers - colony.hammers);

/** The job every colonist of the colony should have this turn. */
export function jobPlan(state: GameState, colony: Colony): Map<string, Job> {
  return memo(state, `jobs:${colony.id}`, () => workOutJobs(state, colony));
}

function workOutJobs(state: GameState, colony: Colony): Map<string, Job> {
  // everybody comes off; the plan does not depend on who was doing what
  let now: Colony = { ...colony, colonists: colony.colonists.map((c) => ({ ...c, job: IDLE })) };
  const placed = new Set<string>();
  const world = (): GameState => ({ ...state, colonies: { ...state.colonies, [colony.id]: now } });
  const put = (c: Colonist, job: Job): void => {
    now = { ...now, colonists: now.colonists.map((x) => (x.id === c.id ? { ...x, job } : x)) };
    if (job.kind === 'idle') placed.delete(c.id);
    else placed.add(c.id);
  };
  const waiting = (): Colonist[] => now.colonists.filter((c) => !placed.has(c.id));
  const report = (): ReturnType<typeof colonyProduction> => colonyProduction(world(), now);
  /** The free square that gives this colonist most of one of these goods. */
  const bestSquare = (c: Colonist, goods: readonly RawGood[]): { job: Job; yield: number } | null => {
    let best: { job: Job; yield: number } | null = null;
    for (const [dx, dy] of NEIGHBORS) {
      if (squareStatus(world(), now, dx, dy) !== 'free') continue;
      const tile = tileAt(state.map, colony.x + dx, colony.y + dy);
      for (const good of goods) {
        if (!tile || isWater(tile) !== (good === 'fish')) continue;
        const amount = fieldOutput(world(), now, c.profession, dx, dy, good);
        if (amount > 0 && (!best || amount > best.yield)) best = { job: { kind: 'field', dx, dy, good }, yield: amount };
      }
    }
    return best;
  };
  /** The automatic placement for this colonist, if it is work on the land, with what it would yield. */
  const automatic = (c: Colonist): { job: Job; yield: number } | null => {
    const without: Colony = { ...now, colonists: now.colonists.filter((x) => x.id !== c.id) };
    const job = suggestPlacement({ ...state, colonies: { ...state.colonies, [colony.id]: without } }, without, c.profession);
    return job.kind === 'field' ? { job, yield: fieldOutput(world(), now, c.profession, job.dx, job.dy, job.good) } : null;
  };
  const short = (): boolean => {
    const r = report();
    const lack = r.consumed.food - r.produced.food;
    return lack > 0 && AI_COLONY.shortTimes * lack >= stock(now, 'food');
  };

  // 1. Food. Expert farmers and (with docks) fishermen first, to their own trade.
  for (const c of now.colonists) {
    const good = PROFESSIONS[c.profession].expertGood;
    if (good !== 'food' && (good !== 'fish' || !now.buildings.includes('docks'))) continue;
    const square = bestSquare(c, [good]);
    if (square && square.yield >= AI_COLONY.yieldLeastShort) put(c, square.job);
  }
  // Then two passes of the automatic placement: the unskilled, and the skilled only while food is short.
  food: for (const pass of [0, 1]) {
    for (const c of waiting()) {
      const hungry = short();
      const due = pass === 0 ? (hungry && !skilled(c)) || c.profession === 'indianConvert' : !skilled(c) || hungry;
      if (!due) continue;
      const square = automatic(c);
      if (!square) continue;
      // the first square not worth working ends the round
      if (square.yield < (hungry ? AI_COLONY.yieldLeastShort : AI_COLONY.yieldLeast)) break food;
      put(c, square.job);
    }
  }

  // 2. Lumber and hammers, while there is something to build.
  if (hammersWanted(now) > 0) {
    const felling = (): boolean => now.colonists.some((c) => c.job.kind === 'field' && c.job.good === 'lumber');
    if (!felling() && stock(now, 'lumber') < AI_COLONY.lumberjackBelow) {
      const order = [...waiting().filter((c) => c.profession === 'expertLumberjack'), ...waiting().filter((c) => !skilled(c)), ...waiting()];
      for (const c of order) {
        const square = bestSquare(c, ['lumber']);
        if (!square) continue;
        put(c, square.job);
        break;
      }
    }
    if (stock(now, 'lumber') + report().produced.lumber >= AI_COLONY.carpenterFrom && workersIn(now, 'carpenter').length === 0 && tradeCapacity(now, 'carpenter') > 0) {
      const order = [...waiting().filter((c) => c.profession === 'masterCarpenter'), ...waiting().filter((c) => c.profession === 'freeColonist'), ...waiting().filter((c) => c.profession === 'indenturedServant' || c.profession === 'pettyCriminal')];
      if (order[0]) put(order[0], { kind: 'work', trade: 'carpenter' });
    }
  }

  // 3. Experts of the land go to their own crop, unless the warehouse is already full of it.
  for (const c of waiting()) {
    const good = PROFESSIONS[c.profession].expertGood;
    if (good === null || good === 'food' || good === 'fish' || stock(now, stored(good)) > warehouseCapacity(now)) continue;
    const square = bestSquare(c, [good]);
    if (square) put(c, square.job);
  }

  // 4. Experts of the workshops go to their own bench, where it stands, has room, and has something to work with.
  for (const c of waiting()) {
    const trade = ownTrade(c);
    if (trade === null || trade === 'teacher' || workersIn(now, trade).length >= tradeCapacity(now, trade)) continue;
    const input = TRADES[trade].input;
    if (input !== null && stock(now, input) <= 0 && report().produced[input] <= 0) continue;
    put(c, { kind: 'work', trade });
  }

  // 5. Everyone else: a seat in the Town Hall while one is due, otherwise whatever pays best, bench or land.
  for (const c of waiting()) {
    const seats = now.colonists.length >= AI_PLAN.statesmanFrom ? Math.min(3, Math.floor(now.colonists.length / AI_PLAN.colonistsPerStatesman)) : 0;
    if (workersIn(now, 'statesman').length < Math.min(seats, tradeCapacity(now, 'statesman')) && c.profession !== 'indianConvert') {
      put(c, { kind: 'work', trade: 'statesman' });
      const r = report();
      if (r.produced.food >= r.consumed.food) continue;
      put(c, IDLE);
    }
    const land = automatic(c);
    let best: { job: Job; worth: number } | null = land && land.job.kind === 'field' ? { job: land.job, worth: land.yield * Math.max(1, priceLevel(state, colony.owner, stored(land.job.good))) } : null;
    for (const trade of TRADE_IDS) {
      const def = TRADES[trade];
      if (def.rule !== 'craft' || def.input === null || workersIn(now, trade).length >= tradeCapacity(now, trade) || c.profession === 'indianConvert') continue;
      const before = report().produced[def.output as GoodId];
      put(c, { kind: 'work', trade });
      const made = report().produced[def.output as GoodId] - before;
      put(c, IDLE);
      const worth = made * priceLevel(state, colony.owner, def.output as GoodId);
      if (made > 0 && (!best || worth > best.worth)) best = { job: { kind: 'work', trade }, worth };
    }
    if (best) {
      put(c, best.job);
      continue;
    }
    // nothing pays: the carpenter's bench, or the pulpit where a church stands
    const spare = (['carpenter', 'preacher'] as const).find((t) => workersIn(now, t).length < tradeCapacity(now, t) && (t !== 'carpenter' || hammersWanted(now) > 0));
    if (spare && c.profession !== 'indianConvert') put(c, { kind: 'work', trade: spare });
  }
  return new Map(now.colonists.map((c) => [c.id, c.job]));
}

/**
 * The next change of job the plan calls for, or null when everyone is where he should be.
 * `plan` may be handed in by a caller that keeps it for the turn, to save working it out again.
 */
export function jobAction(state: GameState, colony: Colony, plan: Map<string, Job> = jobPlan(state, colony)): Action | null {
  const assign = (c: Colonist, job: Job): Action => ({ type: 'assignJob', colonyId: colony.id, colonistId: c.id, job });
  const wrong = colony.colonists.filter((c) => !sameJob(c.job, plan.get(c.id) ?? IDLE));
  for (const c of wrong) {
    const move = assign(c, plan.get(c.id) ?? IDLE);
    if (ok(state, move)) return move;
  }
  // everyone left is waiting for a square or a bench somebody else must leave first: he stands down
  const stuck = wrong.find((c) => c.job.kind !== 'idle');
  return stuck ? assign(stuck, IDLE) : null;
}

// --- what to build ---------------------------------------------------------------------------------

/** The processing chains, in the order they are looked over for a better building. */
const CHAINS: readonly { chain: BuildingChain; output: GoodId }[] = [
  { chain: 'armory', output: 'muskets' }, { chain: 'blacksmith', output: 'tools' }, { chain: 'furTrader', output: 'coats' },
  { chain: 'weaver', output: 'cloth' }, { chain: 'tobacconist', output: 'cigars' }, { chain: 'distiller', output: 'rum' },
];

/** What the colony should be building: the first item on the list that applies and can be started. Null when there is nothing. */
export function buildChoice(state: GameState, colony: Colony): BuildItem | null {
  return memo(state, `build:${colony.id}`, () => workOutBuild(state, colony));
}

function workOutBuild(state: GameState, colony: Colony): BuildItem | null {
  const open = availableItems(state, { ...colony, construction: null });
  const has = (b: BuildingId): boolean => colony.buildings.includes(b);
  /** The building if it can be started now, else the level below it in its chain, and so on down. */
  const building = (b: BuildingId): BuildItem | null => {
    if (has(b)) return null;
    if (open.some((i) => i.kind === 'building' && i.id === b)) return { kind: 'building', id: b };
    const def = BUILDINGS[b];
    const below = def.chain !== null && def.level > 1 ? (BUILDING_CHAINS[def.chain] as readonly BuildingId[])[def.level - 2] : undefined;
    return below ? building(below) : null;
  };
  const unit = (u: 'wagonTrain' | 'artillery' | 'galleon' | 'privateer' | 'frigate'): BuildItem | null => (open.some((i) => i.kind === 'unit' && i.unit === u) ? { kind: 'unit', unit: u } : null);
  const pop = colony.colonists.length;
  const r = colonyProduction(state, colony);
  const player = state.players.find((p) => p.id === colony.owner);
  const level = DIFFICULTIES.indexOf(state.difficulty);
  const squares = NEIGHBORS.map(([dx, dy]) => tileAt(state.map, colony.x + dx, colony.y + dy)).filter((t) => t !== null);
  const water = has('docks') ? 0 : squares.filter((t) => isWater(t)).length;
  const land = squares.length - squares.filter((t) => isWater(t)).length;
  const feeders = colony.colonists.filter((c) => c.job.kind === 'field' && (c.job.good === 'food' || c.job.good === 'fish')).length;
  const wantsDocks = (pop >> 1 < feeders && feeders > 1) || r.produced.food < r.consumed.food;
  const experts = colony.colonists.filter(skilled);
  const teachable = Math.max(0, ...experts.map((c) => (PROFESSIONS[c.profession].teachLevel <= 3 ? PROFESSIONS[c.profession].teachLevel : 0)));
  const warehouses = chainLevel(colony.buildings, 'warehouse');
  const census = fleetCensus(state, colony.owner);
  const near = (range: number): boolean => Object.values(state.units).some((u) => u.owner !== colony.owner && UNIT_TYPES[u.type].domain === 'sea' && UNIT_TYPES[u.type].attack > 0 && u.voyage === null && Math.max(Math.abs(u.x - colony.x), Math.abs(u.y - colony.y)) <= range);
  const human = state.players.find((p) => p.kind === 'human' && !p.withdrawn);
  const humanWarships = human ? fleetCensus(state, human.id).warships : 0;
  const muskets = priceLevel(state, colony.owner, 'muskets');
  const guns = Object.values(state.units).filter((u) => u.owner === colony.owner && u.type === 'artillery' && u.x === colony.x && u.y === colony.y && u.voyage === null).length;
  const factory = CHAINS.some((c) => chainLevel(colony.buildings, c.chain) === 3);

  // each entry is looked at only if everything before it came to nothing
  const list: (() => BuildItem | null | 'stop')[] = [
    () => (land <= pop || (water > 0 && wantsDocks) ? building('docks') : null),
    () => building('stockade'),
    () => (stock(colony, 'horses') >= AI_COLONY.stableHorses ? building('stable') : null),
    () => (pop < AI_COLONY.smallBelow ? 'stop' : null),
    () => (warehouses < 1 && Math.trunc(pop / AI_COLONY.peoplePerWarehouse) > warehouses ? building('warehouseExpansion') : null),
    () => (pop >= AI_COLONY.customFrom && (near(AI_FLEET.besetRange) || humanWarships - AI_COLONY.customLead > census.warships || pop >= AI_COLONY.customAnywayFrom) ? building('customHouse') : null),
    () => (wagonRefusal(state, colony) === null ? unit('wagonTrain') : null),
    () => (teachable >= 1 && pop + experts.length >= AI_COLONY.schoolFrom[0] ? building('schoolhouse') : null),
    () => {
      const dear = muskets + (level >> 1) >= AI_COLONY.armoryPrice || state.turn > AI_COLONY.armoryAfterTurn;
      const tooled = stock(colony, 'tools') >= AI_COLONY.armoryTools || r.produced.tools > 0;
      return (dear && pop >= AI_COLONY.armoryFrom && tooled) || experts.some((c) => c.profession === 'masterGunsmith') ? building('armory') : null;
    },
    () => (experts.some((c) => c.profession === 'firebrandPreacher') ? building('church') : null),
    () => building('lumberMill'),
    () => building('fort'),
    () => (muskets >= AI_COLONY.smithPrice && pop >= AI_COLONY.smithFrom && (stock(colony, 'ore') >= AI_COLONY.smithOre || r.produced.ore > 0) ? building('blacksmithsShop') : null),
    () => (warehouses < Math.trunc(pop / AI_COLONY.peoplePerWarehouse) ? building('warehouseExpansion') : null),
    () => (r.produced.bells >= AI_COLONY.newspaperBells ? building('newspaper') : null),
    () => (teachable >= 2 && pop + experts.length >= AI_COLONY.schoolFrom[1] ? building('college') : null),
    () => (pop < AI_COLONY.mediumBelow ? 'stop' : null),
    () => (teachable >= 3 && pop + experts.length >= AI_COLONY.schoolFrom[2] ? building('university') : null),
    () => building('church'),
    () => (pop >= AI_COLONY.fortressFrom ? building('fortress') : null),
    () => (factory && isPortColony(state, colony) ? building('shipyard') : null),
    () => {
      if (!factory || !has('shipyard') || !player) return null;
      const wants = fleetWants(state, colony.owner);
      return wants.mayBuy ? unit('galleon') : census.warships < AI_FLEET.privateerWarshipsBelow ? unit('privateer') : coloniesOf(state, colony.owner).length > 0 && census.warships < AI_FLEET.frigateWarshipsBelow ? unit('frigate') : null;
    },
    () => (factory && guns === 0 ? building('armory') ?? unit('artillery') : null),
    ...CHAINS.map(({ chain, output }) => (): BuildItem | null => {
      const made = r.produced[output];
      const want = made >= AI_COLONY.chainThird || stock(colony, output) >= AI_COLONY.chainStock ? 3 : made >= AI_COLONY.chainSecond ? 2 : 0;
      const next = (BUILDING_CHAINS[chain] as readonly BuildingId[])[chainLevel(colony.buildings, chain)];
      return chainLevel(colony.buildings, chain) < want && next ? building(next) : null;
    }),
    () => building('cathedral'),
    () => (guns < AI_COLONY.artilleryBelow ? building('armory') ?? (r.produced.muskets > 0 ? unit('artillery') : building('arsenal')) : null),
  ];
  for (const entry of list) {
    const item = entry();
    if (item === 'stop') return null;
    if (item) return item;
  }
  return null;
}

/** The order that puts the colony's choice on the stocks, when it is not what is there already. */
export function buildAction(state: GameState, colony: Colony): Action | null {
  const choice = buildChoice(state, colony);
  if (choice === null ? colony.construction === null : sameItem(choice, colony.construction)) return null;
  const order: Action = { type: 'setConstruction', colonyId: colony.id, item: choice };
  return ok(state, order) ? order : null;
}
