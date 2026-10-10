// What a computer power's colonies are given or do by themselves at the start of its turn
// (docs/RULES.md "Computer powers: upkeep of a colony"), as traced from the original program:
// a few tools and horses bought, a square of land improved with them, carpenters promoted, and
// colonists schooled or trained. None of this is open to a human player.
import { addGoods } from './cargo';
import { NEIGHBORS, coloniesOf } from './colony';
import type { CustomHouseEvent } from './custom-house';
import { settlementAlarm, tribalAlarm } from './alarm';
import { AI_MUSTER, AI_RESERVE, AI_UPKEEP } from './data/ai';
import { chainLevel } from './data/buildings';
import { TRADE_IDS, TRADES } from './data/production';
import { PROFESSION_IDS, PROFESSIONS, UNSKILLED, type ProfessionId } from './data/professions';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { colonyProduction } from './economy';
import { trainingPrice } from './europe';
import { priceLevel } from './market';
import { checkJobSite, jobTurns, type PioneerEvent } from './pioneer';
import { createRng } from './rng';
import { homeOfBrave, isNativeLand, tribeOfOwner } from './settlements';
import { colonyAt, tileAt, type Colonist, type Colony, type GameState, type PlayerId, type Unit } from './state';
import { hasForest, isWater, type Tile } from './tile';

const FARMED: readonly string[] = ['food', 'sugar', 'tobacco', 'cotton'];
const skilled = (c: Colonist): boolean => !UNSKILLED.includes(c.profession);
const stock = (colony: Colony, good: 'tools' | 'horses'): number => colony.goods[good] ?? 0;

export interface LandWork {
  readonly dx: number;
  readonly dy: number;
  readonly job: 'plow' | 'road' | 'clear';
  /** Turns the colony must have waited since it last had work done. */
  readonly wait: number;
}

/** Is the colony so short of farmland that it should clear forest? Fewer good open squares than a quarter of its people, and more than one forest. */
function needsClearing(state: GameState, colony: Colony): boolean {
  const tiles = NEIGHBORS.map(([dx, dy]) => tileAt(state.map, colony.x + dx, colony.y + dy)).filter((t): t is Tile => t !== null);
  const open = tiles.filter((t) => isWater(t) || (!hasForest(t) && t.relief === 'flat')).length;
  return tiles.filter(hasForest).length > 1 && (colony.colonists.length + 3) >> 2 > open;
}

/**
 * The square of its ground a colony would have improved next, if any: one a colonist works
 * without the fitting improvement (the plow for crops, a road for the rest) before any other.
 */
export function landWork(state: GameState, colony: Colony): LandWork | null {
  const clearing = needsClearing(state, colony);
  let best: LandWork | null = null;
  let top = 0;
  for (const [dx, dy] of NEIGHBORS) {
    const x = colony.x + dx;
    const y = colony.y + dy;
    const tile = tileAt(state.map, x, y);
    if (!tile || isWater(tile) || isNativeLand(state, tile, colony.owner) || (tile.claim !== null && tile.claim !== colony.owner)) continue;
    const worker = colony.colonists.find((c) => c.job.kind === 'field' && c.job.dx === dx && c.job.dy === dy);
    const crop = worker !== undefined && worker.job.kind === 'field' && FARMED.includes(worker.job.good);
    const mayPlow = checkJobSite(state, x, y, 'plow').ok;
    const mayRoad = checkJobSite(state, x, y, 'road').ok;
    let job: LandWork['job'] | null = null;
    if (hasForest(tile)) job = clearing ? 'clear' : worker && !crop && mayRoad ? 'road' : null;
    else if (worker ? crop : true) job = mayPlow ? 'plow' : null;
    if (job === null && !hasForest(tile) && mayRoad) job = 'road';
    if (job === null) continue;
    const score = (worker ? AI_UPKEEP.workedTimes : 1) * (job === 'clear' ? AI_UPKEEP.workedTimes : 1);
    if (score > top) {
      top = score;
      best = { dx, dy, job, wait: jobTurns(tile, job === 'road' ? 'road' : 'plow', false) + AI_UPKEEP.waitExtra + (job === 'clear' ? AI_UPKEEP.clearExtra : 0) };
    }
  }
  return best;
}

/** The trade a colonist is working at, as a profession, if there is an expert of it. */
function tradeWorked(c: Colonist): ProfessionId | null {
  if (c.job.kind === 'field') {
    const good = c.job.good;
    return PROFESSION_IDS.find((p) => PROFESSIONS[p].expertGood === good) ?? null;
  }
  if (c.job.kind === 'work') {
    const trade = c.job.trade;
    return TRADE_IDS.includes(trade) ? TRADES[trade].expert : null;
  }
  return null;
}

/** The upkeep of every colony of a computer power, at the start of its turn. */
export function computerColonies(state: GameState, playerId: PlayerId, events: (CustomHouseEvent | PioneerEvent)[] = []): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.kind !== 'ai' || player.withdrawn) return state;
  let gold = player.gold;
  let reserve = player.reserve ?? { muskets: 0, horses: 0 };
  let colonies = state.colonies;
  let tiles = state.map.tiles;
  const level = DIFFICULTIES.indexOf(state.difficulty);
  for (const start of coloniesOf(state, playerId)) {
    let c: Colony = { ...start, waited: Math.min(AI_UPKEEP.waitMost, (start.waited ?? 0) + 1) };
    const rng = createRng(state.rng).fork(`upkeep:${state.turn}:${c.id}`);
    const now = (): GameState => ({ ...state, colonies: { ...colonies, [c.id]: c }, map: { ...state.map, tiles } });
    const work = landWork(now(), c);

    // a few tools, when there is land to improve or every tenth turn
    const toolsCost = AI_UPKEEP.tools * priceLevel(state, playerId, 'tools');
    if (stock(c, 'tools') < AI_UPKEEP.tools && (work !== null || state.turn % AI_UPKEEP.toolsEvery === 0) && gold >= toolsCost) {
      gold -= toolsCost;
      c = { ...c, goods: addGoods(c.goods, 'tools', AI_UPKEEP.tools) };
      events.push({ type: 'colonySupplied', colonyId: c.id, player: playerId, good: 'tools', amount: AI_UPKEEP.tools, cost: toolsCost });
    }
    // a square of its ground improved with them, once it has waited as long as the work takes
    if (work !== null && stock(c, 'tools') >= AI_UPKEEP.tools && state.turn % AI_UPKEEP.restEvery !== 0 && (c.waited ?? 0) >= work.wait) {
      const i = (c.y + work.dy) * state.map.width + c.x + work.dx;
      const tile = tiles[i] as Tile;
      const copy = [...tiles];
      copy[i] = work.job === 'road' ? { ...tile, road: true } : work.job === 'clear' ? { ...tile, forest: false } : { ...tile, plowed: true };
      tiles = copy;
      events.push({ type: 'tileImproved', x: c.x + work.dx, y: c.y + work.dy, improvement: work.job === 'road' ? 'road' : work.job === 'clear' ? 'cleared' : 'plowed', unitId: c.id });
      c = { ...c, goods: addGoods(c.goods, 'tools', -AI_UPKEEP.tools), waited: 0 };
    }

    // a carpenter who was a servant or a criminal is a free colonist; in a large colony an unskilled one may become a master
    const promote = c.colonists.length >= AI_UPKEEP.masterFrom && rng.int(1, AI_UPKEEP.masterOdds - level) === 1;
    c = {
      ...c,
      colonists: c.colonists.map((k): Colonist => {
        if (k.job.kind !== 'work' || k.job.trade !== 'carpenter' || skilled(k) || k.profession === 'indianConvert') return k;
        return { ...k, profession: promote ? 'masterCarpenter' : 'freeColonist' };
      }),
    };

    // a colony with a school turns one colonist into an expert, every so often
    const school = chainLevel(c.buildings, 'school');
    if (school > 0 && (c.waited ?? 0) >= AI_UPKEEP.schoolTurns * (school + (school === 3 ? 1 : 0))) {
      const pupils = c.colonists.filter((k) => k.profession !== 'indianConvert' && !(skilled(k) && tradeWorked(k) === k.profession));
      const pupil = pupils.length > 0 ? pupils[rng.int(0, pupils.length - 1)] : undefined;
      const trade = pupil ? tradeWorked(pupil) : null;
      if (pupil && trade) {
        c = { ...c, colonists: c.colonists.map((k) => (k.id === pupil.id ? { ...k, profession: trade } : k)), waited: 0 };
      }
    }

    // short of food: its last unskilled colonist is trained to fish or farm, for the fee, while taxes are low
    const r = colonyProduction(now(), c);
    const feeders = c.colonists.filter((k) => k.job.kind === 'field' && (k.job.good === 'food' || k.job.good === 'fish')).length;
    const hungry = (c.colonists.length >> 1 < feeders && feeders > 1) || r.produced.food < r.consumed.food;
    if (hungry && player.taxRate <= AI_UPKEEP.trainTaxMost) {
      const has = (p: ProfessionId): boolean => c.colonists.some((k) => k.profession === p);
      const to: ProfessionId | null = !has('expertFisherman') && c.buildings.includes('docks') ? 'expertFisherman' : !has('expertFarmer') ? 'expertFarmer' : null;
      const pupil = [...c.colonists].reverse().find((k) => !skilled(k) && k.profession !== 'indianConvert');
      const fee = to ? trainingPrice(to) : null;
      if (to && pupil && fee !== null && gold >= fee + AI_UPKEEP.trainGoldOver) {
        gold -= fee;
        c = { ...c, colonists: c.colonists.map((k) => (k.id === pupil.id ? { ...k, profession: to } : k)) };
      }
    }

    // a pair of horses, once the colony has seen a ship or a wagon
    const carrier = Object.values(state.units).some((u) => u.owner === playerId && u.voyage === null && u.x === c.x && u.y === c.y && UNIT_TYPES[u.type].holds > 0);
    if (stock(c, 'horses') < AI_UPKEEP.horses && state.turn >= AI_UPKEEP.horsesFromTurn && carrier && gold >= AI_UPKEEP.horsesGold) {
      gold -= AI_UPKEEP.horsesGold;
      events.push({ type: 'colonySupplied', colonyId: c.id, player: playerId, good: 'horses', amount: AI_UPKEEP.horses - stock(c, 'horses'), cost: AI_UPKEEP.horsesGold });
      c = { ...c, goods: addGoods(c.goods, 'horses', AI_UPKEEP.horses - stock(c, 'horses')) };
    }
    // with its defence seen to and muskets to spare, a lot goes to the power's reserve in Europe
    const troops = Object.values(state.units).filter((u) => u.owner === playerId && afoot(u) && u.x === c.x && u.y === c.y && UNIT_TYPES[u.type].attack > 1).length;
    if (troops >= defendersFor(now(), c) && (c.goods.muskets ?? 0) >= AI_RESERVE.colonyMuskets && reserve.muskets < AI_RESERVE.lotsMost) {
      reserve = { ...reserve, muskets: reserve.muskets + 1 };
      c = { ...c, goods: addGoods(c.goods, 'muskets', -AI_RESERVE.lot) };
      events.push({ type: 'reserveStocked', colonyId: c.id, player: playerId, good: 'muskets', amount: AI_RESERVE.lot });
    }
    colonies = { ...colonies, [c.id]: c };
  }
  // late in the game the reserve's muskets and horses are levelled, a lot for fifty horses
  if (state.turn > AI_RESERVE.levelAfterTurn) {
    while (reserve.muskets + 1 < Math.trunc(reserve.horses / AI_RESERVE.lot)) reserve = { muskets: reserve.muskets + 1, horses: reserve.horses - AI_RESERVE.lot };
    while (Math.trunc(reserve.horses / AI_RESERVE.lot) + 1 < reserve.muskets) reserve = { muskets: reserve.muskets - 1, horses: reserve.horses + AI_RESERVE.lot };
  }
  return { ...state, colonies, map: tiles === state.map.tiles ? state.map : { ...state.map, tiles }, players: state.players.map((p) => (p.id === playerId ? { ...p, gold, ...(reserve.muskets > 0 || reserve.horses > 0 || p.reserve ? { reserve } : {}) } : p)) };
}

// --- defenders ------------------------------------------------------------------------------------

const reach = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const afoot = (u: Unit): boolean => u.voyage === null && u.aboard === null && UNIT_TYPES[u.type].domain === 'land';

/** What threatens a colony: the weight of foreign land units within five squares, and whether any that count stand next to it. */
export function threatTo(state: GameState, colony: Colony): { readonly total: number; readonly adjacent: boolean } {
  let total = 0;
  let adjacent = false;
  for (const u of Object.values(state.units)) {
    if (u.owner === colony.owner || !afoot(u)) continue;
    const away = reach(u.x, u.y, colony.x, colony.y);
    if (away > AI_MUSTER.threatRange) continue;
    let weight: number = UNIT_TYPES[u.type].attack;
    const tribe = tribeOfOwner(u.owner);
    if (tribe) {
      // braves count only when their people, and their own village, have turned on us
      const home = homeOfBrave(state, u.id);
      if (tribalAlarm(state, tribe, colony.owner) < AI_MUSTER.tribeAlarmFrom || (home ? settlementAlarm(home, colony.owner) : 0) < AI_MUSTER.villageAlarmFrom) weight = 0;
    } else {
      if (weight <= 1) weight = 0;
      else if (state.players.find((p) => p.id === u.owner)?.kind === 'human') weight += weight >> 1;
    }
    if (colonyAt(state, u.x, u.y)) weight >>= 1;
    weight = Math.trunc((weight * (AI_MUSTER.threatFalloff - away)) / AI_MUSTER.threatFalloff);
    if (weight !== 0 && away <= 1) adjacent = true;
    total += weight;
  }
  // walls divide it, but never below what it was up to sixteen
  total = Math.max(Math.trunc(total / (chainLevel(colony.buildings, 'fortification') + 1)), Math.min(total, AI_MUSTER.threatFloor));
  return { total, adjacent };
}

/** A colony's people for these reckonings: its colonists and the colonist-type units standing on its square. */
export function peopleAt(state: GameState, colony: Colony): number {
  return colony.colonists.length + Object.values(state.units).filter((u) => u.owner === colony.owner && afoot(u) && u.x === colony.x && u.y === colony.y && UNIT_TYPES[u.type].colonistRole).length;
}

/**
 * Defenders a colony wants: half its people less one, or an eighth of the threat if that is
 * more, but never over half its people; one more after the Declaration; at least one while a
 * threat stands next to it and it has more than one person.
 */
export function defendersFor(state: GameState, colony: Colony): number {
  const people = peopleAt(state, colony);
  const threat = threatTo(state, colony);
  let wanted = Math.min(Math.max((people - 1) >> 1, Math.trunc(threat.total / AI_MUSTER.threatPerDefender)), people >> 1);
  if (state.crownPlayer !== null) wanted += 1;
  if (threat.adjacent && people > 1) wanted = Math.max(wanted, 1);
  return Math.max(0, wanted);
}
