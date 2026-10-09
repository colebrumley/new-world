// Wagon trains of the computer powers and their trade with the native peoples (R-804;
// docs/RULES.md "Computer powers: wagon trains"). Nothing is remembered between calls. Where a
// wagon is in its round shows in its orders: one standing by on sentry in its colony has
// unloaded and may load for the natives; one on sentry beside a settlement is there to trade,
// and has traded once its moves are spent.
import { validateAction, type Action } from '../engine/actions';
import { tribalAlarm } from '../engine/alarm';
import { dateOfTurn } from '../engine/calendar';
import { amountOf } from '../engine/cargo';
import { availableItems } from '../engine/construction';
import { AI_WAGONS } from '../engine/data/ai';
import { GOOD_IDS, type GoodId } from '../engine/data/goods';
import { NATIVES } from '../engine/data/tribes';
import { UNIT_TYPES } from '../engine/data/units';
import { priceLevel } from '../engine/market';
import { routeFor, planMove } from '../engine/movement';
import { warehouseCapacity } from '../engine/pioneer';
import { landmassAt } from '../engine/regions';
import { createRng, type Rng } from '../engine/rng';
import { tribeOfOwner } from '../engine/settlements';
import { colonyAt, type BuildItem, type Colony, type GameState, type Settlement, type Unit } from '../engine/state';
import { wagonHomes } from '../engine/wagons';

const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;
const WAGON: BuildItem = { kind: 'unit', unit: 'wagonTrain' };

/** A stream of chances for one unit's decisions this turn: the same however often it is asked. */
export const aiRng = (state: GameState, label: string): Rng => createRng(state.rng).fork(`ai:${state.turn}:${label}`);

/** The native settlements on a landmass. */
export function settlementsOn(state: GameState, land: number): Settlement[] {
  return Object.values(state.settlements).filter((s) => landmassAt(state.map, s.x, s.y) === land);
}

/** The settlement on the same landmass a wagon at (x, y) would make for: the nearest, a capital counting at half its distance. */
export function wagonTarget(state: GameState, x: number, y: number): Settlement | null {
  let best: Settlement | null = null;
  let least = Infinity;
  for (const s of settlementsOn(state, landmassAt(state.map, x, y))) {
    const away = far(s.x, s.y, x, y);
    const counted = s.capital ? Math.max(1, Math.trunc(away / AI_WAGONS.capitalNearer)) : away;
    if (counted < least) {
      least = counted;
      best = s;
    }
  }
  return best;
}

/** Does an armed unit of someone the colony has cause to fear stand next to it? */
export function isThreatened(state: GameState, colony: Colony): boolean {
  const owner = state.players.find((p) => p.id === colony.owner);
  return Object.values(state.units).some((u) => {
    if (u.owner === colony.owner || u.voyage !== null || u.aboard !== null || UNIT_TYPES[u.type].attack <= 0 || far(u.x, u.y, colony.x, colony.y) !== 1) return false;
    const tribe = tribeOfOwner(u.owner);
    // braves of a people on good terms come and go; a rival power's soldiers count unless there is a treaty
    return tribe ? tribalAlarm(state, tribe, colony.owner) >= AI_WAGONS.buildAlarmBelow : owner?.stance[u.owner] !== 'peace';
  });
}

/** Should this colony be building a wagon train? Returns the reason it should not, or null if it should. */
export function wagonRefusal(state: GameState, colony: Colony): 'served' | 'tooLate' | 'noNatives' | 'alarmed' | 'threatened' | 'notAvailable' | null {
  if (Object.values(wagonHomes(state, colony.owner)).includes(colony.id)) return 'served';
  if (dateOfTurn(state.turn).year >= AI_WAGONS.buildBeforeYear) return 'tooLate';
  const nearest = settlementsOn(state, landmassAt(state.map, colony.x, colony.y))
    .sort((a, b) => far(a.x, a.y, colony.x, colony.y) - far(b.x, b.y, colony.x, colony.y))[0];
  if (!nearest) return 'noNatives';
  if (tribalAlarm(state, nearest.tribe, colony.owner) >= AI_WAGONS.buildAlarmBelow) return 'alarmed';
  if (isThreatened(state, colony)) return 'threatened';
  return availableItems(state, colony).some((i) => i.kind === 'unit' && i.unit === 'wagonTrain') ? null : 'notAvailable';
}

export const isWagonProject = (colony: Colony): boolean => colony.construction?.kind === 'unit' && colony.construction.unit === 'wagonTrain';

/** The order to start a wagon train in this colony, when one is due and it is not already on the stocks. */
export function wagonBuild(state: GameState, colony: Colony): Action | null {
  if (isWagonProject(colony)) return null;
  if (wagonRefusal(state, colony) !== null) return null;
  const build: Action = { type: 'setConstruction', colonyId: colony.id, item: WAGON };
  return ok(state, build) ? build : null;
}

/**
 * What a wagon loads for the natives from this colony's stores: the good that scores best,
 * up to a full cargo of it. Cheap in Europe and plentiful here is what it looks for.
 */
export function wagonLoad(state: GameState, colony: Colony, rng: Rng): { good: GoodId; amount: number } | null {
  const capacity = warehouseCapacity(colony);
  let best: GoodId | null = null;
  let top = 0;
  for (const good of GOOD_IDS) {
    if ((AI_WAGONS.neverLoaded as readonly GoodId[]).includes(good)) continue;
    const stock = amountOf(colony.goods, good);
    let price = priceLevel(state, colony.owner, good);
    while (price >= AI_WAGONS.markdownFrom && rng.int(1, AI_WAGONS.markdownOdds) === 1) price -= 1;
    const limit = good === 'tradeGoods' ? AI_WAGONS.tradeGoodsLimit : AI_WAGONS.priceLimit;
    if (stock < AI_WAGONS.stockLeast || price >= limit) continue;
    const counted = stock >= capacity && good !== 'food' ? stock * AI_WAGONS.fullStockTimes : stock;
    const score = counted * (limit - price) + AI_WAGONS.pricePenalty * (1 - price);
    if (score > top) {
      top = score;
      best = good;
    }
  }
  return best ? { good: best, amount: Math.min(AI_WAGONS.cargo, amountOf(colony.goods, best)) } : null;
}

/** Answer the trade talks under way: the village's first price is taken, and of its wares the one dearest in Europe is bought if the gold is there. */
export function parleyAction(state: GameState): Action | null {
  const parley = state.parley;
  const player = state.players[state.current];
  if (!parley || !player || parley.player !== player.id) return null;
  if (parley.stage === 'selling') return { type: 'parley', reply: 'accept' };
  let pick: { good: GoodId; price: number } | null = null;
  for (const offer of parley.offers) {
    if (!pick || priceLevel(state, player.id, offer.good) > priceLevel(state, player.id, pick.good)) pick = offer;
  }
  const buy: Action | null = pick && player.gold >= pick.price ? { type: 'parley', reply: 'accept', good: pick.good } : null;
  return buy && ok(state, buy) ? buy : { type: 'parley', reply: 'leave' };
}

const laden = (unit: Unit): GoodId[] => GOOD_IDS.filter((g) => amountOf(unit.cargo, g) > 0);

/** Can the unit take the first step of the way there now? A march that cannot start is not ordered. */
function canSetOut(state: GameState, unit: Unit, x: number, y: number): boolean {
  if (unit.movesLeft <= 0) return true;
  const step = routeFor(state, unit, x, y)?.steps[0];
  return step !== undefined && planMove(state, unit, step[0] - unit.x, step[1] - unit.y, { sail: false }).ok;
}

function goBeside(state: GameState, unit: Unit, x: number, y: number): Action | null {
  const squares: (readonly [number, number])[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) squares.push([x + dx, y + dy]);
  squares.sort((a, b) => far(a[0], a[1], unit.x, unit.y) - far(b[0], b[1], unit.x, unit.y));
  for (const [sx, sy] of squares) {
    const go: Action = { type: 'goTo', unitId: unit.id, x: sx, y: sy };
    if (ok(state, go) && canSetOut(state, unit, sx, sy)) return go;
  }
  return null;
}

const loadFor = (state: GameState, wagon: Unit, colony: Colony): { good: GoodId; amount: number } | null => wagonLoad(state, colony, aiRng(state, wagon.id));

/** The next thing a wagon train does, or null when it has nothing to do just now. */
export function wagonAction(state: GameState, wagon: Unit): Action | null {
  if (wagon.orders === 'goto') return null;
  const cargo = laden(wagon);
  const here = colonyAt(state, wagon.x, wagon.y);
  const homeId = wagonHomes(state, wagon.owner)[wagon.id];
  const home = homeId === undefined ? null : state.colonies[homeId] ?? null;
  const atHome = here !== null && home !== null && here.id === home.id;
  const goHome = (): Action | null => {
    // already there: standing down is what lets it unload
    if (atHome) return { type: 'setOrders', unitId: wagon.id, orders: 'none' };
    const go: Action | null = home ? { type: 'goTo', unitId: wagon.id, x: home.x, y: home.y } : null;
    return go && ok(state, go) ? go : null;
  };
  const disband: Action = { type: 'disbandUnit', unitId: wagon.id };

  if (atHome && wagon.orders !== 'sentry') {
    // home: everything comes off first; then it stands by to load, if it still has the day before it
    const first = cargo[0];
    if (first) return { type: 'unloadCargo', unitId: wagon.id, good: first, amount: amountOf(wagon.cargo, first) };
    const target = wagon.movesLeft > 0 ? wagonTarget(state, wagon.x, wagon.y) : null;
    const wanted = target && (far(target.x, target.y, wagon.x, wagon.y) <= 1 || goBeside(state, wagon, target.x, target.y)) && loadFor(state, wagon, home as Colony);
    return wanted ? { type: 'setOrders', unitId: wagon.id, orders: 'sentry' } : null;
  }
  if (atHome && cargo.length === 0) {
    const target = wagon.movesLeft > 0 ? wagonTarget(state, wagon.x, wagon.y) : null;
    const load = target ? loadFor(state, wagon, home as Colony) : null;
    const take: Action | null = load ? { type: 'loadCargo', unitId: wagon.id, good: load.good, amount: load.amount } : null;
    return take && ok(state, take) ? take : null;
  }

  if (cargo.length === 0) return home ? goHome() : disband;
  // carrying: to the nearest settlement, one cargo offered at whatever they will give, then home
  if (wagon.orders === 'sentry' && wagon.movesLeft <= 0) return goHome();
  const target = wagonTarget(state, wagon.x, wagon.y);
  if (!target) return disband;
  if (far(target.x, target.y, wagon.x, wagon.y) > 1) return goBeside(state, wagon, target.x, target.y);
  if (wagon.movesLeft <= 0) return null;
  const good = aiRng(state, `${wagon.id}:offer`).pick(cargo);
  const action = tribalAlarm(state, target.tribe, wagon.owner) < (NATIVES.alarmLevels[2] as number) ? 'trade' : 'enterHostile';
  const enter: Action = { type: 'enterSettlement', unitId: wagon.id, settlementId: target.id, action, good };
  // it cannot go in (no moves to spare for it, say): take the cargo home again (or, at home already, call it a day)
  if (!ok(state, enter)) return atHome ? { type: 'skipUnit', unitId: wagon.id } : goHome();
  return wagon.orders === 'sentry' ? enter : { type: 'setOrders', unitId: wagon.id, orders: 'sentry' };
}
