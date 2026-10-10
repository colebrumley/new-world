// How a computer power runs a colony (docs/RULES.md "Computer powers: the colony"): every turn
// the jobs are dealt out afresh in a fixed order (food, a lumberjack, a carpenter, experts to
// their trades, everyone else to whatever pays best) and the thing to build is chosen from a
// fixed list. Nothing is remembered: both are worked out from the colony as it stands.
import { validateAction, type Action } from '../engine/actions';
import { NEIGHBORS, coloniesOf } from '../engine/colony';
import { availableItems, isPortColony, itemCost, sameItem } from '../engine/construction';
import { tribalAlarm } from '../engine/alarm';
import { dateOfTurn } from '../engine/calendar';
import { AI_COLONY, AI_FLEET, AI_JOBS, AI_UPKEEP } from '../engine/data/ai';
import { BUILDING_CHAINS, BUILDINGS, chainLevel, type BuildingChain, type BuildingId } from '../engine/data/buildings';
import type { GoodId } from '../engine/data/goods';
import { TRADE_IDS, TRADES, type TradeId } from '../engine/data/production';
import { PROFESSIONS, UNSKILLED } from '../engine/data/professions';
import { RAW_GOODS, type RawGood } from '../engine/data/terrain';
import type { TribeId } from '../engine/data/tribes';
import { solPercent } from '../engine/liberty';
import { isNativeLand } from '../engine/settlements';
import { powerRank } from './missions';
import { UNIT_TYPES } from '../engine/data/units';
import { DIFFICULTIES } from '../engine/data/yields';
import { colonyProduction, tradeCapacity, workersIn } from '../engine/economy';
import { fleetCensus, fleetWants } from '../engine/fleet';
import { fieldOutput, squareStatus } from '../engine/jobs';
import { priceLevel } from '../engine/market';
import { warehouseCapacity } from '../engine/pioneer';
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
  const player = state.players.find((p) => p.id === colony.owner);
  const human = state.players.find((p) => p.kind === 'human' && !p.withdrawn && p.id !== colony.owner);
  /** Does the power stand at least as high as the human (and is there one)? */
  const standing = human === undefined ? 0 : Math.sign(powerRank(state, colony.owner) - powerRank(state, human.id));
  const level = (good: GoodId): number => priceLevel(state, colony.owner, good);
  const guards = Object.values(state.units).filter((u) => u.owner === colony.owner && u.voyage === null && u.aboard === null && u.x === colony.x && u.y === colony.y && UNIT_TYPES[u.type].defense > 1).length;
  /**
   * The automatic placement for this colonist on the land, with what it would yield and how it
   * scores: for every free square and crop, (8 x yield, no more than the warehouse has room
   * for) + 7 - its distance, times a weight for the crop.
   */
  const automatic = (c: Colonist): { job: Job; yield: number; score: number } | null => {
    const here = world();
    const r = colonyProduction(here, now);
    const capacity = warehouseCapacity(now);
    let best: { job: Job; yield: number; score: number } | null = null;
    for (const [dx, dy] of NEIGHBORS) {
      if (squareStatus(here, now, dx, dy) !== 'free') continue;
      const tile = tileAt(state.map, colony.x + dx, colony.y + dy);
      if (!tile) continue;
      for (const good of RAW_GOODS) {
        if (isWater(tile) !== (good === 'fish')) continue;
        const raw = fieldOutput(here, now, c.profession, dx, dy, good);
        // (a fisherman's room is measured against the horses in store)
        const room = Math.max(1, capacity - stock(now, good === 'fish' ? 'horses' : good));
        const amount = Math.min(raw, room);
        if (amount <= 0) continue;
        let reach = AI_JOBS.yieldTimes * amount + AI_JOBS.nearness - Math.abs(dx) - Math.abs(dy);
        const kept = stored(good);
        let weight: number;
        if (good === 'food' || good === 'fish') weight = now.colonists.length < 2 * NEIGHBORS.length ? AI_JOBS.foodWeight : 0;
        else {
          weight = level(kept);
          if (good === 'ore' && now.colonists.length >= AI_JOBS.oreFrom[0] && state.turn >= AI_JOBS.oreFrom[1]) {
            weight += AI_JOBS.oreBonus;
            if (standing >= 0) weight += Math.max(0, chainLevel(now.buildings, 'blacksmith') - 1) + 2 * chainLevel(now.buildings, 'armory');
          }
        }
        let more = weight + 1;
        const lack = r.consumed[kept] - r.produced[kept];
        if (lack > 0) {
          more += 1;
          if (lack > stock(now, kept)) reach *= 2;
        } else if (good === 'lumber' && stock(now, 'lumber') + r.produced.lumber >= AI_COLONY.carpenterFrom) more -= 1;
        if ((AI_JOBS.worked as readonly RawGood[]).includes(good)) more += AI_JOBS.workedBonus;
        // native ground costs more the calmer its people, less for every guard in the colony
        if (isNativeLand(state, tile, colony.owner)) more -= Math.max(0, AI_UPKEEP.nativeCalm - tribalAlarm(state, tile.homeland as TribeId, colony.owner) - guards);
        const score = (Math.max(more, 0) + weight) * reach;
        if (score > 0 && (!best || score > best.score)) best = { job: { kind: 'field', dx, dy, good }, yield: raw, score };
      }
    }
    return best;
  };
  const short = (): boolean => {
    const r = report();
    const lack = r.consumed.food - r.produced.food;
    return lack > 0 && AI_COLONY.shortTimes * lack >= stock(now, 'food');
  };

  /** What a statesman's bells count for: more with Tories, a press, Jefferson and the years; nothing before 1540 or after the Declaration; less in a small colony. */
  const bellsWeight = (bellsMade: number): number => {
    const declared = state.crownPlayer !== null;
    const pop = now.colonists.length;
    const tories = declared ? 0 : Math.trunc((pop * (100 - solPercent(state, now)) + 50) / 100);
    let w = AI_JOBS.bells + tories + AI_JOBS.bellsPerPress * chainLevel(now.buildings, 'press');
    if (tories >= AI_JOBS.toriesMany) w *= 2;
    if (player?.fathers.includes('thomasJefferson')) w *= 2;
    const year = dateOfTurn(state.turn).year;
    if (year < AI_JOBS.bellsFromYear) w = 0;
    for (const y of AI_JOBS.bellsDoubledAfter) if (year > y) w *= 2;
    if (declared) w = 0;
    for (const size of AI_JOBS.bellsHalvedUnder) if (pop < size) w >>= 1;
    if (human !== undefined && standing > 0) w >>= 1;
    if (human !== undefined && standing < 0) w *= 2;
    return Math.min(100, Math.max(1, w - bellsMade));
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

  // 5. Everyone else: the best-scoring bench against the best the land offers; the land wins a tie.
  const BENCHES = ['distiller', 'tobacconist', 'weaver', 'furTrader', 'carpenter', 'blacksmith', 'gunsmith', 'preacher', 'statesman'] as const;
  for (const c of waiting()) {
    if (c.profession === 'indianConvert') {
      const field = automatic(c);
      if (field) put(c, field.job);
      continue;
    }
    const land = automatic(c);
    let best = 0;
    let bench: TradeId = 'carpenter';
    // (what a bench has to work with is carried over to the pulpit and the Town Hall from the last bench looked at)
    let avail = Infinity;
    const before = report();
    for (const trade of BENCHES) {
      const def = TRADES[trade];
      if (chainLevel(now.buildings, def.chain) === 0 || workersIn(now, trade).length >= tradeCapacity(now, trade)) continue;
      if (def.input !== null) {
        avail = stock(now, def.input) - before.consumed[def.input] + before.produced[def.input];
        if (avail < 0) continue;
        if (avail === 0) avail = 1;
      }
      put(c, { kind: 'work', trade });
      const made = report().potential[def.output] - before.potential[def.output];
      put(c, IDLE);
      const amount = Math.min(made, avail);
      let weight: number;
      if (trade === 'carpenter') weight = Math.max(1, (AI_JOBS.carpenter - Math.trunc(before.produced.hammers / 3)) >> (hammersWanted(now) > 0 ? 0 : 1));
      else if (trade === 'preacher') weight = Math.max(1, AI_JOBS.preacher - (before.produced.crosses >> 1) - Math.trunc(state.turn / 100));
      else if (trade === 'statesman') weight = bellsWeight(before.produced.bells);
      else if (trade === 'blacksmith' || trade === 'gunsmith') weight = (level(def.output as GoodId) + AI_JOBS.armsBonus) * (state.turn >= AI_JOBS.armsDoubledFrom && human !== undefined && standing >= 0 ? 2 : 1);
      else weight = level(def.output as GoodId) - level(def.input as GoodId);
      const score = (AI_JOBS.yieldTimes * amount + AI_JOBS.benchBase) * weight;
      if (score > best) {
        best = score;
        bench = trade;
      }
    }
    if ((land?.score ?? 0) >= best) {
      if (land) put(c, land.job);
      else {
        // nothing on the land: the pulpit where a church stands and lumber is not wanted, else the carpenter's bench
        const r = report();
        const spare = now.buildings.some((x) => x === 'church' || x === 'cathedral') && stock(now, 'lumber') + r.produced.lumber > r.consumed.lumber && workersIn(now, 'preacher').length < tradeCapacity(now, 'preacher') ? 'preacher' : 'carpenter';
        if (workersIn(now, spare).length < tradeCapacity(now, spare)) put(c, { kind: 'work', trade: spare });
      }
    } else put(c, { kind: 'work', trade: bench });
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
