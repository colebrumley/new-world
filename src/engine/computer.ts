// What a computer power's colonies are given or do by themselves at the start of its turn
// (docs/RULES.md "Computer powers: upkeep of a colony"):
// a few tools and horses bought, a square of land improved with them, carpenters promoted, and
// colonists schooled or trained. None of this is open to a human player.
import { addGoods } from './cargo';
import { NEIGHBORS, coloniesOf } from './colony';
import type { CustomHouseEvent } from './custom-house';
import { settlementAlarm, tribalAlarm } from './alarm';
import { AI_FREIGHT, AI_MUSTER, AI_NATIVE_WAR, AI_RESERVE, AI_UPKEEP } from './data/ai';
import { chainLevel } from './data/buildings';
import { TRADE_IDS, TRADES } from './data/production';
import { PROFESSION_IDS, PROFESSIONS, UNSKILLED, type ProfessionId } from './data/professions';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { colonyProduction } from './economy';
import { trainingPrice } from './europe';
import { priceLevel } from './market';
import { checkJobSite, type PioneerEvent } from './pioneer';
import { landmassAt } from './regions';
import { RESOURCES } from './data/resources';
import { TERRAIN } from './data/terrain';
import type { TribeId } from './data/tribes';
import { wagonHomes } from './wagons';
import { createRng, type Rng } from './rng';
import { homeOfBrave, isNativeLand, tribeOfOwner } from './settlements';
import { colonyAt, tileAt, type Colonist, type Colony, type GameState, type PlayerId, type Unit } from './state';
import { hasForest, isWater, terrainOf, type Tile } from './tile';

const FARMED: readonly string[] = ['food', 'sugar', 'tobacco', 'cotton'];
const skilled = (c: Colonist): boolean => !UNSKILLED.includes(c.profession);
const stock = (colony: Colony, good: 'tools' | 'horses'): number => colony.goods[good] ?? 0;

export interface LandWork {
  readonly dx: number;
  readonly dy: number;
  /** Null when the best square has nothing left to do on it: then nothing is done at all. */
  readonly job: 'plow' | 'road' | 'clear' | null;
  /** Turns the colony must have waited since it last had work done. */
  readonly wait: number;
}

const OPEN_LAND: readonly string[] = ['plains', 'grassland', 'prairie', 'savannah', 'marsh', 'swamp'];
const landRow = (tile: Tile): number => TERRAIN[terrainOf(tile)].yields.food;

/** What a colony makes of the ground around it: whether it has work for tools at all, and whether it should clear forest. */
export function groundWanted(state: GameState, colony: Colony): { readonly work: boolean; readonly clear: boolean } {
  let poor = 0;
  let good = 0;
  let forests = 0;
  let clearable = 0;
  let unimproved = false;
  for (const [dx, dy] of NEIGHBORS) {
    const tile = tileAt(state.map, colony.x + dx, colony.y + dy);
    if (!tile) {
      poor += 1;
      continue;
    }
    if (isWater(tile)) {
      poor += 2;
      good += 1;
    } else if (hasForest(tile)) {
      poor += 1;
      forests += 1;
      if (landRow({ ...tile, forest: false }) >= AI_UPKEEP.goodFarm) clearable += 1;
    } else if (landRow(tile) >= AI_UPKEEP.goodFarm) good += 1;
    else if (landRow(tile) < AI_UPKEEP.poorFarm) poor += 1;
    const worked = !isWater(tile) && colony.colonists.some((c) => c.job.kind === 'field' && c.job.dx === dx && c.job.dy === dy);
    if (worked && (!tile.road || (!tile.plowed && tile.relief === 'flat' && !tile.forest && tile.base !== 'arctic'))) unimproved = true;
  }
  const clear = forests > 1 && (NEIGHBORS.length - 1 <= poor || ((colony.colonists.length + 3) >> 2 > good && clearable > 0));
  return { work: clear || unimproved, clear };
}

/**
 * The square of its ground a colony would have improved next, if any, and what would be done
 * there: scored by the worth of the terrain (or of its resource), doubled where a colonist
 * works it without the fitting improvement, or where forest is to be cleared.
 */
export function landWork(state: GameState, colony: Colony): LandWork | null {
  const wanted = groundWanted(state, colony);
  if (!wanted.work) return null;
  const owner = state.players.find((p) => p.id === colony.owner);
  const land = landmassAt(state.map, colony.x, colony.y);
  const natives = Object.values(state.settlements).some((v) => landmassAt(state.map, v.x, v.y) === land);
  const wagon = Object.values(wagonHomes(state, colony.owner)).includes(colony.id);
  let best: { dx: number; dy: number; tile: Tile; clearing: boolean; worker: Colonist | undefined } | null = null;
  let top = -1;
  for (const [dx, dy] of NEIGHBORS) {
    const tile = tileAt(state.map, colony.x + dx, colony.y + dy);
    if (!tile || isWater(tile) || (tile.claim !== null && tile.claim !== colony.owner && state.players.some((p) => p.id === tile.claim))) continue;
    const worker = colony.colonists.find((c) => c.job.kind === 'field' && c.job.dx === dx && c.job.dy === dy);
    let score: number = tile.resource ? RESOURCES[tile.resource].aiValue : TERRAIN[terrainOf(tile)].aiValue;
    const clearing = wanted.clear && hasForest(tile);
    if (clearing) score *= 2;
    else {
      const crop = worker !== undefined && worker.job.kind === 'field' && FARMED.includes(worker.job.good);
      if (worker && (crop ? !tile.plowed : !tile.road)) score *= 2;
      if (tile.road && tile.plowed) continue;
    }
    if (isNativeLand(state, tile, colony.owner)) {
      // native ground: only that of a people already angry is worth the taking
      let term = AI_UPKEEP.nativeCalm - tribalAlarm(state, tile.homeland as TribeId, colony.owner);
      if (tile.resource) term *= 2;
      if (natives && !wagon) {
        if (!wanted.clear) continue;
        term *= 2;
      }
      term = (owner?.gold ?? 0) < AI_UPKEEP.nativeGold ? term * 2 : term >> 1;
      score -= term;
    }
    if (score > top) {
      top = score;
      best = { dx, dy, tile, clearing, worker };
    }
  }
  if (!best) return null;
  const { dx, dy, tile, clearing, worker } = best;
  // never beside a human's unit or colony, unless something of ours stands on the square
  const x = colony.x + dx;
  const y = colony.y + dy;
  const isHuman = (id: string): boolean => state.players.some((p) => p.id === id && p.kind === 'human');
  const ours = Object.values(state.units).some((u) => u.owner === colony.owner && u.voyage === null && u.x === x && u.y === y);
  const beside = (ox: number, oy: number): boolean => Math.max(Math.abs(ox - x), Math.abs(oy - y)) === 1;
  if (!ours && (Object.values(state.units).some((u) => u.voyage === null && isHuman(u.owner) && beside(u.x, u.y)) || Object.values(state.colonies).some((c) => isHuman(c.owner) && beside(c.x, c.y)))) return null;
  const crop = worker !== undefined && worker.job.kind === 'field' && FARMED.includes(worker.job.good);
  const plowable = OPEN_LAND.includes(tile.base) && tile.relief === 'flat' && !tile.forest;
  let job: LandWork['job'];
  if (clearing) job = 'clear';
  else if (worker && crop && !tile.plowed) job = hasForest(tile) ? 'clear' : checkJobSite(state, x, y, 'plow').ok ? 'plow' : null;
  else if (worker && !crop && !tile.road) job = 'road';
  else if (plowable) job = tile.plowed ? null : 'plow';
  else job = tile.road ? null : 'road';
  return { dx, dy, job, wait: TERRAIN[terrainOf(tile)].improve + AI_UPKEEP.waitExtra + (clearing ? AI_UPKEEP.clearExtra : 0) };
}

/**
 * The square on which a colony would lay a stretch of road toward a sister colony this turn:
 * the first roadless square on the way to one of the power's other colonies on its land that
 * lies within seven squares one way or the other, each such colony having one chance in the
 * number of the others. Null when the colony has not waited long enough, or there is none.
 */
export function sisterRoad(state: GameState, colony: Colony, rng: Rng): readonly [number, number] | null {
  const land = landmassAt(state.map, colony.x, colony.y);
  const mine = coloniesOf(state, colony.owner).filter((c) => landmassAt(state.map, c.x, c.y) === land);
  if (mine.length < 2) return null;
  for (const other of mine) {
    if (other.id === colony.id || (Math.abs(other.x - colony.x) >= AI_UPKEEP.sisterWithin && Math.abs(other.y - colony.y) >= AI_UPKEEP.sisterWithin)) continue;
    if (rng.int(0, mine.length - 2) !== 0) continue;
    let x = colony.x;
    let y = colony.y;
    let square: readonly [number, number] | null = null;
    while (x !== other.x || y !== other.y) {
      x += Math.sign(other.x - x);
      y += Math.sign(other.y - y);
      const tile = tileAt(state.map, x, y);
      if (!tile || isWater(tile)) break;
      if (!colonyAt(state, x, y) && !tile.road) {
        square = [x, y];
        break;
      }
    }
    if (!square) continue;
    const [sx, sy] = square;
    if (Object.values(state.units).some((u) => u.owner !== colony.owner && u.voyage === null && u.x === sx && u.y === sy)) continue;
    const tile = tileAt(state.map, sx, sy) as Tile;
    return TERRAIN[terrainOf(tile)].improve + AI_UPKEEP.waitExtra > (colony.waited ?? 0) ? null : square;
  }
  return null;
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
  let taxRate = player.taxRate;
  let tribeWars = player.tribeWars ?? [];
  let colonies = state.colonies;
  let tiles = state.map.tiles;
  const level = DIFFICULTIES.indexOf(state.difficulty);
  for (const start of coloniesOf(state, playerId)) {
    let c: Colony = { ...start, waited: Math.min(AI_UPKEEP.waitMost, (start.waited ?? 0) + 1) };
    const rng = createRng(state.rng).fork(`upkeep:${state.turn}:${c.id}`);
    const now = (): GameState => ({ ...state, colonies: { ...colonies, [c.id]: c }, map: { ...state.map, tiles } });
    const wanted = groundWanted(now(), c);

    // a few tools, when there is ground to improve or every tenth turn
    const toolsCost = AI_UPKEEP.tools * priceLevel(state, playerId, 'tools');
    if (stock(c, 'tools') < AI_UPKEEP.tools && (wanted.work || state.turn % AI_UPKEEP.toolsEvery === 0) && gold >= toolsCost) {
      gold -= toolsCost;
      c = { ...c, goods: addGoods(c.goods, 'tools', AI_UPKEEP.tools) };
      events.push({ type: 'colonySupplied', colonyId: c.id, player: playerId, good: 'tools', amount: AI_UPKEEP.tools, cost: toolsCost });
    }
    const improve = (x: number, y: number, job: 'plow' | 'road' | 'clear'): void => {
      const i = y * state.map.width + x;
      const tile = tiles[i] as Tile;
      const copy = [...tiles];
      copy[i] = job === 'road' ? { ...tile, road: true } : job === 'clear' ? { ...tile, forest: false } : { ...tile, plowed: true };
      tiles = copy;
      events.push({ type: 'tileImproved', x, y, improvement: job === 'road' ? 'road' : job === 'clear' ? 'cleared' : 'plowed', unitId: c.id });
      c = { ...c, goods: addGoods(c.goods, 'tools', -Math.min(AI_UPKEEP.tools, stock(c, 'tools'))), waited: 0 };
    };
    if (stock(c, 'tools') >= AI_UPKEEP.tools && state.turn % AI_UPKEEP.restEvery === 0) {
      // every seventh turn: a stretch of road toward a sister colony
      const square = sisterRoad(now(), c, rng);
      if (square) improve(square[0], square[1], 'road');
    } else if (stock(c, 'tools') >= AI_UPKEEP.tools && wanted.work) {
      // on the others: a square of its own ground, once the colony has waited as long as the work takes
      const work = landWork(now(), c);
      if (work && work.job !== null && (c.waited ?? 0) >= work.wait) improve(c.x + work.dx, c.y + work.dy, work.job);
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

    const r = colonyProduction(now(), c);
    const has = (p: ProfessionId): boolean => c.colonists.some((k) => k.profession === p);
    const count = (p: ProfessionId): number => c.colonists.filter((k) => k.profession === p).length;
    const feeders = c.colonists.filter((k) => k.job.kind === 'field' && (k.job.good === 'food' || k.job.good === 'fish')).length;
    const water = NEIGHBORS.filter(([dx, dy]) => { const t = tileAt(state.map, c.x + dx, c.y + dy); return t !== null && isWater(t); }).length;

    // a colony with a school turns one colonist into an expert, after a wait that grows with the school
    const school = chainLevel(c.buildings, 'school');
    if (school > 0 && (c.waited ?? 0) >= (AI_UPKEEP.schoolWait[school - 1] as number)) {
      let to: ProfessionId | null = null;
      // a small colony with no more experts on food than it has people feeding it: a fisherman while it has water to spare, else a farmer
      if (c.colonists.length < AI_UPKEEP.schoolFoodBelow && count('expertFarmer') + count('expertFisherman') <= feeders) to = count('expertFisherman') < water ? 'expertFisherman' : 'expertFarmer';
      // a workshop of the second level (an armory of any) with stuff to work and no master: an expert of the land that goes with its place in the list
      AI_UPKEEP.schoolChains.forEach((row, k) => {
        if (chainLevel(c.buildings, row.chain) >= row.levels && r.produced[row.input] > 0 && !has(row.master)) to = AI_UPKEEP.schoolPupils[k] as ProfessionId;
      });
      const pupils = c.colonists.filter((k) => k.profession !== 'indianConvert' && !(skilled(k) && (tradeWorked(k) === k.profession || k.job.kind === 'idle')));
      const pupil = pupils.length > 0 ? pupils[rng.int(0, pupils.length - 1)] : undefined;
      const trade = pupil ? to ?? tradeWorked(pupil) : null;
      if (pupil && trade) c = { ...c, colonists: c.colonists.map((k) => (k.id === pupil.id ? { ...k, profession: trade } : k)) };
      if (pupil) c = { ...c, waited: 0 };
    }

    // short of food and not building docks: its last unskilled colonist is trained to fish or farm, while taxes are low and the treasury deep
    const hungry = ((c.colonists.length >> 1 < feeders && feeders > 1) || r.produced.food + (c.goods.food ?? 0) < r.consumed.food)
      && !(c.construction?.kind === 'building' && c.construction.id === 'docks');
    if (hungry && taxRate <= AI_UPKEEP.trainTaxMost && gold >= (trainingPrice('expertFarmer') ?? 0)) {
      const to: ProfessionId | null = !has('expertFisherman') && c.buildings.includes('docks') ? 'expertFisherman' : !has('expertFarmer') ? 'expertFarmer' : null;
      const at = c.colonists.map((k, i) => (!skilled(k) && k.profession !== 'indianConvert' ? i : -1)).filter((i) => i >= 0).pop();
      if (to && at !== undefined) {
        // the fee is the price of the trade that stands at his place in the list of trades, which may be none at all (then a gold piece comes back)
        const listed = PROFESSION_IDS[at];
        const fee = (listed ? trainingPrice(listed) : null) ?? -1;
        // (never on credit: a fee the treasury cannot meet is not paid and nobody is trained)
        if (gold >= fee) {
          gold -= fee;
          taxRate = Math.min(AI_UPKEEP.taxMost, taxRate + 1);
          c = { ...c, colonists: c.colonists.map((k, i) => (i === at ? { ...k, profession: to } : k)) };
        }
      }
    }

    // a pair of horses, once the colony has seen a ship or a wagon
    const carrier = Object.values(state.units).some((u) => u.owner === playerId && u.voyage === null && u.x === c.x && u.y === c.y && UNIT_TYPES[u.type].holds > 0);
    if (stock(c, 'horses') < AI_UPKEEP.horses && state.turn >= AI_UPKEEP.horsesFromTurn && carrier && gold >= AI_UPKEEP.horsesGold) {
      gold -= AI_UPKEEP.horsesGold;
      events.push({ type: 'colonySupplied', colonyId: c.id, player: playerId, good: 'horses', amount: AI_UPKEEP.horses - stock(c, 'horses'), cost: AI_UPKEEP.horsesGold });
      c = { ...c, goods: addGoods(c.goods, 'horses', AI_UPKEEP.horses - stock(c, 'horses')) };
    }
    // it may make up its mind to fight the people nearest it
    const foe = tribeToFight(now(), c);
    if (foe && !tribeWars.includes(foe)) tribeWars = [...tribeWars, foe];
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
  // each of its ships lying in one of its ports with a foreign frigate near counts another turn of waiting
  let units = state.units;
  for (const u of Object.values(state.units)) {
    if (u.owner !== playerId || UNIT_TYPES[u.type].domain !== 'sea' || u.voyage !== null) continue;
    const port = colonyAt(state, u.x, u.y);
    const beset = port !== null && port.owner === playerId && Object.values(state.units).some((f) => f.owner !== playerId && (f.type === 'frigate' || f.type === 'manOWar') && f.voyage === null && reach(f.x, f.y, u.x, u.y) <= AI_FREIGHT.blockadeRange);
    const turns = beset ? (u.blockaded ?? 0) + 1 : 0;
    if (turns !== (u.blockaded ?? 0)) units = { ...units, [u.id]: { ...u, blockaded: turns } };
  }
  return { ...state, units, colonies, map: tiles === state.map.tiles ? state.map : { ...state.map, tiles }, players: state.players.map((p) => (p.id === playerId ? { ...p, gold, taxRate, ...(tribeWars.length > 0 ? { tribeWars } : {}), ...(reserve.muskets > 0 || reserve.horses > 0 || p.reserve ? { reserve } : {}) } : p)) };
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

/**
 * Is this ship of a computer power kept in port by a blockade? A caravel or merchantman lying
 * in one of its power's colonies with a foreign frigate near, until she has lain there ten
 * turns less her holds. She neither loads, nor leaves, nor carries on with a standing order.
 */
export function heldByBlockade(state: GameState, ship: Unit): boolean {
  if (!(AI_FREIGHT.blockadeHolds as readonly string[]).includes(ship.type) || ship.voyage !== null) return false;
  if (state.players.find((p) => p.id === ship.owner)?.kind !== 'ai' || colonyAt(state, ship.x, ship.y)?.owner !== ship.owner) return false;
  const waited = ship.blockaded ?? 0;
  return waited > 0 && AI_FREIGHT.blockadeWait - UNIT_TYPES[ship.type].holds > waited;
}

/**
 * The native people a colony's power decides to fight, if any: the people of the settlement
 * nearest the colony on its land, when no rival European is on that land, the power has units
 * in the field there, the people are not too strong for it, and they are already restless.
 * The Spanish need neither the absence of rivals nor the restlessness, and dare twice as much.
 */
export function tribeToFight(state: GameState, colony: Colony): string | null {
  const owner = state.players.find((p) => p.id === colony.owner);
  if (!owner) return null;
  const land = landmassAt(state.map, colony.x, colony.y);
  const on = (at: { x: number; y: number }): boolean => landmassAt(state.map, at.x, at.y) === land;
  const villages = Object.values(state.settlements).filter(on).sort((a, b) => reach(a.x, a.y, colony.x, colony.y) - reach(b.x, b.y, colony.x, colony.y));
  const nearest = villages[0];
  if (!nearest) return null;
  const bold = owner.nation === AI_MUSTER.unbounded;
  const isRival = (id: string): boolean => id !== colony.owner && state.players.some((p) => p.id === id);
  const rivals = Object.values(state.colonies).some((c) => isRival(c.owner) && on(c)) || Object.values(state.units).some((u) => isRival(u.owner) && afoot(u) && on(u));
  if (rivals && !bold) return null;
  const mine = Object.values(state.units).filter((u) => u.owner === colony.owner && afoot(u));
  const might = (u: Unit): number => UNIT_TYPES[u.type].defense * AI_NATIVE_WAR.strengthPer;
  // units in the field are those not standing in one of its colonies
  const field = Math.min(AI_NATIVE_WAR.cap, mine.filter((u) => on(u) && !colonyAt(state, u.x, u.y)).reduce((n, u) => n + might(u), 0));
  if (field < AI_NATIVE_WAR.fieldLeast) return null;
  const total = mine.reduce((n, u) => n + might(u), 0);
  const braves = Object.values(state.units).filter((u) => tribeOfOwner(u.owner) === nearest.tribe && afoot(u));
  const theirs = Math.min(AI_NATIVE_WAR.cap, braves.reduce((n, u) => n + UNIT_TYPES[u.type].attack * AI_NATIVE_WAR.strengthPer, 0));
  const here = Math.min(AI_NATIVE_WAR.cap, braves.filter(on).reduce((n, u) => n + UNIT_TYPES[u.type].attack * AI_NATIVE_WAR.strengthPer, 0));
  const daring = bold ? 2 : 1;
  if (theirs > AI_NATIVE_WAR.totalTimes * daring * total || here >= AI_NATIVE_WAR.fieldTimes * daring * field) return null;
  return bold || tribalAlarm(state, nearest.tribe, colony.owner) > AI_NATIVE_WAR.alarmOver ? nearest.tribe : null;
}
