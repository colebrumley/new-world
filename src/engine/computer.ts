// What a computer power's colonies are given or do by themselves at the start of its turn
// (docs/RULES.md "Computer powers: upkeep of a colony"), as traced from the original program:
// a few tools and horses bought, a square of land improved with them, carpenters promoted, and
// colonists schooled or trained. None of this is open to a human player.
import { addGoods } from './cargo';
import { NEIGHBORS, coloniesOf } from './colony';
import type { CustomHouseEvent } from './custom-house';
import { AI_UPKEEP } from './data/ai';
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
import { isNativeLand } from './settlements';
import { tileAt, type Colonist, type Colony, type GameState, type PlayerId } from './state';
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
    colonies = { ...colonies, [c.id]: c };
  }
  return { ...state, colonies, map: tiles === state.map.tiles ? state.map : { ...state.map, tiles }, players: state.players.map((p) => (p.id === playerId ? { ...p, gold } : p)) };
}
