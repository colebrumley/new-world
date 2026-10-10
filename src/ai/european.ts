// The computer powers' policy (R-802). It plays through the same actions a human uses. Each
// call looks at the state afresh and names the next thing to do for the power whose turn it is,
// ending the turn when nothing useful is left. Nothing is remembered between calls: standing
// Go To orders carry intentions from turn to turn.
//
// What it does: lands its people on good coastal sites and founds colonies there; sends each
// newcomer to found another or to join a colony that wants him (settle.ts); has its colonies
// arm their own people (muster.ts); keeps its ships ferrying immigrants and supplies from
// Europe (supply.ts) and does its business on the docks there; and sets its colonies building.
// Its wagon trains, missionaries, warships and campaigns are in the modules beside this one.
import { applyAction, validateAction, type Action, type GameEvent } from '../engine/actions';
import { holdsFree } from '../engine/cargo';
import { landmassAt } from '../engine/regions';
import { coloniesOf, checkColonySite } from '../engine/colony';
import { AI_DOCKS, AI_FLEET, AI_MUSTER, AI_PIONEER, AI_PLAN, AI_RESERVE, AI_SCOUT, AI_SETTLE, AI_SUPPLY } from '../engine/data/ai';
import { fleetCensus, fleetWants } from '../engine/fleet';
import { GOOD_IDS } from '../engine/data/goods';
import { UNSKILLED } from '../engine/data/professions';
import { UNIT_TYPES } from '../engine/data/units';
import { docksOf, shipsInEurope } from '../engine/europe';
import { recruitPrice } from '../engine/immigration';
import { askPrice } from '../engine/market';
import { isInlandLake } from '../engine/movement';
import { tribalAlarm } from '../engine/alarm';
import { colonyAt, type Colony, type GameState, type Job, type Player, type Unit } from '../engine/state';
import { TERRAIN } from '../engine/data/terrain';
import { TRIBES } from '../engine/data/tribes';
import { isExploredBy, isWater, terrainOf, type Tile } from '../engine/tile';
import { defendersShort, garrisons, invasionFor, isFull, isQuiet, isTroop, landAttackChoice, landingStep, landOrders } from './campaign';
import { missionaryAction, ordain, villageVisit, type Chances } from './missions';
import { isWarship, privateersCarry, warshipAction } from './navy';
import { buildAction, jobAction, jobPlan } from './colony';
import { musterAction } from './muster';
import { europeBound, inOwnPort, loadChoice, mayLoad, pickupFor } from './freight';
import { coloniesStillWanted, deliveryPort, joinTarget, mayFound, regionAppeal, siteWorth, wantsColonists } from './settle';
import { cargoPort, powerWants } from './supply';
import { aiRng, parleyAction, wagonAction } from './wagons';

const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;
const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const tileOf = (state: GameState, x: number, y: number): Tile | undefined =>
  x > 0 && y > 0 && x < state.map.width - 1 && y < state.map.height - 1 ? state.map.tiles[y * state.map.width + x] : undefined;
const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;
const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';
const isSettler = (u: Unit): boolean => UNIT_TYPES[u.type].colonistRole && u.type !== 'missionary' && u.profession !== null && u.profession !== 'indianConvert';
const isFighter = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'land' && UNIT_TYPES[u.type].attack > 1;

/** How good a place for a colony this is to the power whose turn it is; 0 if it will not do. */
export function siteScore(state: GameState, x: number, y: number, colonist = true): number {
  const player = state.players[state.current];
  if (!player || !tileOf(state, x, y) || !checkColonySite(state, x, y).ok) return 0;
  return siteWorth(state, player, x, y, colonist);
}

const waters = new Map<string, Map<number, number>>();
/** The same, remembered: the seas of a world do not change. */
function seaReach(state: GameState, x: number, y: number): Map<number, number> {
  const key = `${state.seed}:${state.map.width}x${state.map.height}:${x},${y}`;
  let known = waters.get(key);
  if (!known) {
    if (waters.size > 600) waters.clear();
    waters.set(key, (known = seaDistances(state, x, y)));
  }
  return known;
}

/** Can a ship at (x, y) sail to this colony: is the colony's square, or water beside it, within her seas? (A ship in port is reckoned from the water beside it.) */
function canReach(state: GameState, x: number, y: number, colony: Colony): boolean {
  if (colony.x === x && colony.y === y) return true;
  const { width } = state.map;
  const starts: (readonly [number, number])[] = isWater(state.map.tiles[y * width + x] as Tile) ? [[x, y]] : DIRS.map(([dx, dy]) => [x + dx, y + dy] as const).filter(([tx, ty]) => { const t = tileOf(state, tx, ty); return t !== undefined && isWater(t); });
  return starts.some(([sx, sy]) => {
    const seas = seaReach(state, sx, sy);
    return DIRS.some(([dx, dy]) => seas.has((colony.y + dy) * width + colony.x + dx));
  });
}

/** How many squares a ship at (x, y) must sail to reach each water square, by breadth-first search; unreachable water is absent. */
function seaDistances(state: GameState, x: number, y: number): Map<number, number> {
  const { width } = state.map;
  const seen = new Map<number, number>([[y * width + x, 0]]);
  let frontier: (readonly [number, number])[] = [[x, y]];
  for (let d = 1; frontier.length > 0; d++) {
    const next: (readonly [number, number])[] = [];
    for (const [fx, fy] of frontier) {
      for (const [dx, dy] of DIRS) {
        const tx = fx + dx;
        const ty = fy + dy;
        const t = tileOf(state, tx, ty);
        if (!t || !isWater(t) || seen.has(ty * width + tx)) continue;
        seen.set(ty * width + tx, d);
        next.push([tx, ty]);
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * The best colony site for someone at (x, y) to make for, within `reach` squares. A ship passes
 * its sea distances so that a site is judged by how far she must really sail to lie beside it,
 * and one she cannot reach is not considered.
 */
function bestSite(state: GameState, x: number, y: number, reach: number, bySea: Map<number, number> | null = null, haste = 1, allow: (x: number, y: number) => boolean = () => true, colonist = true): { x: number; y: number; score: number } | null {
  let best: { x: number; y: number; score: number } | null = null;
  const x0 = Math.max(1, x - reach);
  const x1 = Math.min(state.map.width - 2, x + reach);
  const y0 = Math.max(1, y - reach);
  const y1 = Math.min(state.map.height - 2, y + reach);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const raw = allow(tx, ty) ? siteScore(state, tx, ty, colonist) : 0;
      if (raw === 0) continue;
      let away = far(x, y, tx, ty);
      if (bySea) {
        const berths = DIRS.map(([dx, dy]) => bySea.get((ty + dy) * state.map.width + tx + dx)).filter((d): d is number => d !== undefined);
        if (berths.length === 0) continue;
        away = Math.min(...berths);
      }
      const score = raw - AI_PLAN.sitePerSquare * away * haste;
      if (!best || score > best.score) best = { x: tx, y: ty, score };
    }
  }
  return best;
}

type Site = { x: number; y: number; score: number } | null;
const seaSites = new WeakMap<readonly Tile[], Map<string, Site>>();
/**
 * The best site a ship at (x, y) can reach by sea, anywhere on the map: on any land, or
 * (`fresh`) only on land where this power has no colony and there is room for one. The answer
 * is kept while the colonies stand where they do, since every passenger asks it every time.
 */
function siteBySea(state: GameState, player: Player, x: number, y: number, reach: number, haste: number, fresh: boolean, colonist = true): Site {
  const mine = coloniesOf(state, player.id);
  const where = Object.values(state.colonies).map((c) => `${c.x},${c.y},${c.owner === player.id ? 1 : 0}`).join(';');
  const key = `${player.id}|${x},${y}|${reach}|${haste}|${fresh ? 1 : 0}${colonist ? 1 : 0}|${Object.keys(state.settlements).length}|${where}`;
  let known = seaSites.get(state.map.tiles);
  if (!known) seaSites.set(state.map.tiles, (known = new Map()));
  if (!known.has(key)) {
    const newLand = (tx: number, ty: number): boolean => {
      const land = landmassAt(state.map, tx, ty);
      return !mine.some((c) => landmassAt(state.map, c.x, c.y) === land) && regionAppeal(state, player, land) > 0;
    };
    if (known.size > 400) known.clear();
    known.set(key, bestSite(state, x, y, reach, seaDistances(state, x, y), haste, fresh ? newLand : undefined, colonist));
  }
  return known.get(key) ?? null;
}

/** A colony site on a square next to this ship, if there is one worth having. */
function siteBeside(state: GameState, ship: Unit): readonly [number, number] | null {
  let best: readonly [number, number] | null = null;
  let top = 0;
  for (const [dx, dy] of DIRS) {
    // a square somebody else is standing on cannot be landed on, however good it looks
    if (Object.values(state.units).some((u) => u.x === ship.x + dx && u.y === ship.y + dy && u.owner !== ship.owner && u.voyage === null)) continue;
    const score = siteScore(state, ship.x + dx, ship.y + dy);
    if (score > top) {
      top = score;
      best = [dx, dy];
    }
  }
  return best;
}

function nearestColony(mine: readonly Colony[], x: number, y: number): Colony | null {
  let best: Colony | null = null;
  for (const c of mine) if (!best || far(c.x, c.y, x, y) < far(best.x, best.y, x, y)) best = c;
  return best;
}

/**
 * The round of buying in Europe (docs/RULES.md "Computer powers: the treasury and the fleet"):
 * at most one ship a turn, the first on the list that applies and can be paid for, and now and
 * then a piece of artillery besides. `done` keeps what has been seen to this turn; tests put
 * their own `chances` in.
 */
export function fleetPurchase(state: GameState, player: Player, done: Set<string> = new Set(), chances: Chances = (label) => aiRng(state, label)): Action | null {
  const wants = fleetWants(state, player.id);
  if (state.crownPlayer !== null) return null;
  const census = fleetCensus(state, player.id);
  const buy = (unit: Unit['type'], mark: string): Action | null => {
    const order: Action = { type: 'purchaseUnit', unit };
    if (!ok(state, order)) return null;
    done.add(mark);
    return order;
  };
  if (!done.has('#ship') && wants.mayBuy) {
    // the throws are the same however often the question is put this turn
    const rng = chances(`${player.id}:fleet`);
    const one = (odds: number): boolean => rng.int(1, odds) === 1;
    let order: Action | null = null;
    let over = false;
    // the human's frigate or privateers are answered before anything else, and nothing else is bought if that fails
    if (wants.frigate) over = (order = buy('frigate', '#ship')) === null;
    if (!order && !over && wants.privateer) over = (order = buy('privateer', '#ship')) === null;
    if (!order && !over && census.warships < AI_FLEET.frigateWarshipsBelow && one(AI_FLEET.frigateOdds) && wants.lag) order = buy('frigate', '#ship');
    if (!order && !over && !one(AI_FLEET.galleonOdds)) order = buy('galleon', '#ship');
    if (!order && !over && one(AI_FLEET.merchantmanOdds) && census.holds < AI_FLEET.merchantmanHoldsBelow) order = buy('merchantman', '#ship');
    if (!order && !over && census.holds <= AI_FLEET.caravelHoldsMost) order = buy('caravel', '#ship');
    if (!order && !over && census.warships < AI_FLEET.privateerWarshipsBelow && one(AI_FLEET.privateerOdds) && wants.lag && !wants.short) order = buy('privateer', '#ship');
    done.add('#ship');
    if (order) return order;
  }
  if (!done.has('#guns')) {
    done.add('#guns');
    const onDocks = docksOf(state, player.id).some((u) => u.type === 'artillery');
    // guns are sent for while some colony has no muskets to arm its people with
    const unarmed = coloniesOf(state, player.id).some((c) => (c.goods.muskets ?? 0) === 0);
    if (!onDocks && unarmed && chances(`${player.id}:guns`).int(1, AI_FLEET.artilleryOdds) === 1 && !wants.short && census.holds > AI_FLEET.artilleryHoldsOver) return buy('artillery', '#guns');
  }
  return null;
}

/** How many times a marker of this kind has been set this turn. */
const tally = (done: Set<string>, mark: string): number => [...done].filter((m) => m.startsWith(mark)).length;

/**
 * The power's business on the docks (docs/RULES.md "Computer powers: on the docks"): what its
 * ships brought is sold; it may pay one recruit's fare; those waiting may be armed or made
 * pioneers or missionaries; with an armed man waiting it recruits dragoons to fill its largest
 * ship; goods its colonies ask for are bought; and every ship sails.
 */
function europeAction(state: GameState, player: Player, done: Set<string>): Action | null {
  const bought = fleetPurchase(state, player, done);
  if (bought) return bought;
  const mine = coloniesOf(state, player.id);
  const ships = shipsInEurope(state, player.id).filter((s) => s.repair === 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const ship of ships) {
    if (done.has(`#laden:${ship.id}`)) continue;
    for (const good of GOOD_IDS) {
      const amount = Math.min(100, ship.cargo[good] ?? 0);
      const sale: Action = { type: 'sellGoods', unitId: ship.id, good, amount };
      if (amount > 0 && ok(state, sale)) return sale;
    }
  }
  const rng = (label: string): ReturnType<typeof aiRng> => aiRng(state, `${player.id}:docks:${label}`);
  const before = state.crownPlayer === null;
  const short = fleetWants(state, player.id).short;
  const cargoTurn = state.turn % AI_SUPPLY.cargoEvery === 0 && mine.length > 0;
  const waiting = docksOf(state, player.id).sort((a, b) => (a.id < b.id ? -1 : 1));
  const plain = (u: Unit): boolean => u.type === 'colonist' && u.profession !== null;
  const unskilled = (u: Unit): boolean => UNSKILLED.includes(u.profession ?? 'freeColonist');
  const mineAll = Object.values(state.units).filter((u) => u.owner === player.id);

  // a recruit, while the docks are empty and colonies want people
  if (!done.has('#recruit')) {
    done.add('#recruit');
    const wanting = mine.filter((c) => wantsColonists(state, c)).length;
    const people = mine.reduce((n, c) => n + c.colonists.length, 0) + mineAll.filter((u) => UNIT_TYPES[u.type].colonistRole).length;
    const reserve = Math.max(0, AI_DOCKS.reserveTimes * (AI_DOCKS.reservePerPerson * people - state.turn));
    const order: Action = { type: 'recruit', slot: rng('recruit').int(0, 2) };
    if (before && waiting.length === 0 && !short && !cargoTurn && wanting - mineAll.filter((u) => u.type === 'colonist').length >= mine.length >> AI_DOCKS.recruitColoniesShift
      && player.gold >= recruitPrice(state, player.id) + reserve && ok(state, order)) return order;
  }

  // a man just armed takes a horse if there is one to be had; a recruit raised for the dragoons is armed and mounted
  for (const unit of waiting) {
    if (done.has(`#mount:${unit.id}`)) {
      done.delete(`#mount:${unit.id}`);
      const mount: Action = { type: 'equipInEurope', unitId: unit.id, role: 'dragoon' };
      if (ok(state, mount)) return mount;
    }
    if (done.has('#draft') && plain(unit) && !done.has(`#fit:${unit.id}`)) {
      done.delete('#draft');
      done.add(`#fit:${unit.id}`);
      for (const role of ['dragoon', 'soldier'] as const) {
        const arm: Action = { type: 'equipInEurope', unitId: unit.id, role };
        if (ok(state, arm)) return arm;
      }
    }
  }
  // fitting out those who wait: the unskilled first
  for (const unit of [...waiting.filter(unskilled), ...waiting.filter((u) => !unskilled(u))]) {
    if (!plain(unit) || done.has(`#fit:${unit.id}`) || cargoTurn) continue;
    done.add(`#fit:${unit.id}`);
    const k = unskilled(unit) ? 0 : 1;
    const throws = rng(unit.id);
    const one = (odds: number): boolean => throws.int(1, odds) === 1;
    const fitted = tally(done, '#fitted:');
    const stillWanted = fitted > 0 ? 0 : coloniesStillWanted(state, player);
    const muskets = powerWants(state, player).muskets - tally(done, '#fitted:soldier');
    const arm: Action = { type: 'equipInEurope', unitId: unit.id, role: 'soldier' };
    const byWant = muskets > 0 && one(AI_DOCKS.soldierOdds + k);
    const byYear = stillWanted !== 0 && one(AI_DOCKS.lateOdds + k) && state.turn >= AI_DOCKS.lateFrom;
    if ((byWant || byYear) && !short && ok(state, arm)) {
      done.add(`#fitted:soldier:${unit.id}`);
      done.add(`#mount:${unit.id}`);
      return arm;
    }
    const pioneers = mineAll.filter((u) => u.type === 'pioneer').length;
    const tooled: Action = { type: 'equipInEurope', unitId: unit.id, role: 'pioneer' };
    if (stillWanted > pioneers && one(AI_DOCKS.pioneerOdds) && !waiting.some((u) => u.type === 'pioneer') && (state.turn < AI_DOCKS.lateFrom || pioneers < throws.int(0, AI_DOCKS.pioneersMost))
      && (k === 0 || one(AI_DOCKS.skilledPioneerOdds)) && ok(state, tooled)) {
      done.add(`#fitted:pioneer:${unit.id}`);
      return tooled;
    }
  }
  const blessing = ordain(state, player);
  if (blessing) return blessing;

  // with an armed man waiting, recruits are raised as dragoons while the largest ship has room for them
  const armed = waiting.filter(isFighter).length;
  const largest = Math.max(0, ...ships.map((s) => UNIT_TYPES[s.type].holds));
  if (before && !short && !cargoTurn && armed > 0 && largest - armed > 0 && waiting.length < largest) {
    const order: Action = { type: 'recruit', slot: rng(`draft:${waiting.length}`).int(0, 2) };
    const kit = (player.reserve?.muskets ?? 0) > 0 ? 0 : AI_MUSTER.muskets * askPrice(state, player.id, 'muskets');
    if (player.gold >= recruitPrice(state, player.id) + kit && ok(state, order)) {
      done.add('#draft');
      return order;
    }
  }
  // and a gun for its largest ship, if she is a big one
  const gun: Action = { type: 'purchaseUnit', unit: 'artillery' };
  if (before && !short && !cargoTurn && armed > 0 && !done.has('#gun') && !waiting.some((u) => u.type === 'artillery') && largest >= AI_RESERVE.artilleryHolds && state.turn >= AI_RESERVE.artilleryFromTurn) {
    done.add('#gun');
    if (ok(state, gun)) return gun;
  }
  if (ships.length === 0) return null;

  // goods the colonies ask for, a lot of each, while holds are left over from the passengers
  const wants = powerWants(state, player);
  const dockUnits = waiting.length + (state.turn % 2);
  const someoneFitted = tally(done, '#fitted:') > 0 || waiting.some((u) => u.type === 'pioneer');
  for (const ship of ships) {
    // a privateer or man-of-war carries nothing out
    const carrier = ship.type !== 'manOWar' && (ship.type !== 'privateer' || privateersCarry(state, player));
    const mayLoad = carrier && !short && mine.length > 0 && before;
    // a lot of each good, muskets first and food last
    for (const good of [...GOOD_IDS].reverse()) {
      if (!mayLoad || done.has(`#lot:${ship.id}:${good}`)) continue;
      done.add(`#lot:${ship.id}:${good}`);
      const free = holdsFree(state, ship);
      if (free <= 0 || (someoneFitted && !cargoTurn && free <= AI_SUPPLY.holdsKept)) continue;
      if (!cargoTurn && wants[good] - tally(done, `#bought:${good}:`) < dockUnits) continue;
      const order: Action = { type: 'buyGoods', unitId: ship.id, good, amount: AI_SUPPLY.lot };
      if (!ok(state, order)) continue;
      done.add(`#laden:${ship.id}`);
      done.add(`#bought:${good}:${ship.id}`);
      return order;
    }
  }
  // every ship sails, loaded or not
  for (const ship of ships) {
    const sail: Action = { type: 'sailFromEurope', unitId: ship.id };
    if (ok(state, sail)) return sail;
  }
  return null;
}

function shipAction(state: GameState, ship: Unit, player: Player, mine: readonly Colony[], done: Set<string>): Action | null {
  const port = inOwnPort(state, ship);
  // in one of our ports everything in the hold goes ashore, once each call: a warship's too, before she takes up her station
  if (port && !done.has(`#unloaded:${ship.id}`)) {
    for (const good of GOOD_IDS) {
      const unload: Action = { type: 'unloadCargo', unitId: ship.id, good, amount: ship.cargo[good] ?? 0 };
      if ((ship.cargo[good] ?? 0) > 0 && ok(state, unload)) return unload;
    }
    done.add(`#unloaded:${ship.id}`);
  }
  // warships fight and keep their stations; only when free of that do they do a transport's work
  const duty = isWarship(ship) ? warshipAction(state, ship, player) : undefined;
  if (duty !== undefined) return duty;
  if (ship.repair > 0 || ship.orders === 'goto') return null;
  // pioneers waiting on the quay to go with her count as her passengers already
  const waitingPioneers = port ? Object.values(state.units).filter((u) => u.owner === player.id && u.x === ship.x && u.y === ship.y && u.aboard === null && u.orders === 'sentry' && u.type === 'pioneer') : [];
  const riders = [...Object.values(state.units).filter((u) => u.aboard === ship.id), ...waitingPioneers];
  // then she loads what the colony has to send, a hold at a time, keeping room for those waiting to board
  if (port && !done.has(`#laden:${ship.id}`) && mayLoad(state, player, ship)) {
    const boarding = Object.values(state.units).filter((u) => u.owner === player.id && u.x === ship.x && u.y === ship.y && u.aboard === null && u.orders === 'sentry' && !isShip(u)).length;
    const choice = holdsFree(state, ship) - boarding > 0 ? loadChoice(state, port) : null;
    const load: Action | null = choice ? { type: 'loadCargo', unitId: ship.id, good: choice.good, amount: choice.amount } : null;
    if (load && ok(state, load)) return load;
    done.add(`#laden:${ship.id}`);
  }
  // off an invasion beach she lies to while her troops go over the side, however many have gone already
  if (riders.some((r) => landingStep(state, r, ship, player) !== null)) return null;
  // a full ship with soldiers aboard (or waiting on the quay to board as she sails) may make a landing beside a rival colony
  const quay = colonyAt(state, ship.x, ship.y)?.owner === player.id ? Object.values(state.units).filter((u) => u.owner === player.id && u.x === ship.x && u.y === ship.y && u.aboard === null && u.orders === 'sentry' && isTroop(u)) : [];
  if (mine.length >= AI_PLAN.coloniesBeforeGarrison && (riders.some(isTroop) || quay.length > 0) && isFull(state, ship, quay.length)) {
    const landing = invasionFor(state, player, ship.x, ship.y);
    if (landing && (landing.x !== ship.x || landing.y !== ship.y)) {
      const go: Action = { type: 'goTo', unitId: ship.id, x: landing.x, y: landing.y };
      if (ok(state, go)) return go;
    }
  }
  // guns and other troops who will not settle, with no landing to make, are carried to the port shortest of defenders (the nearest of those)
  const settling = riders.some(isSettler) || riders.some((u) => u.type === 'missionary');
  if (!settling && riders.some(isTroop)) {
    if (port) return null; // they go down the gangway themselves
    const posts = mine.filter((c) => canReach(state, ship.x, ship.y, c))
      .sort((a, b) => defendersShort(state, b) - defendersShort(state, a) || far(a.x, a.y, ship.x, ship.y) - far(b.x, b.y, ship.x, ship.y));
    const post = posts.map((c): Action => ({ type: 'goTo', unitId: ship.id, x: c.x, y: c.y })).find((go) => ok(state, go));
    return post ?? null;
  }
  const preaching = !riders.some(isSettler) && riders.some((u) => u.type === 'missionary') && mine.length > 0;
  // (pioneers still on the quay go only if there is somewhere to take them)
  const aboard = riders.filter((r) => r.aboard === ship.id);
  const somewhere = waitingPioneers.length === 0 || aboard.some(isSettler) || siteBySea(state, player, ship.x, ship.y, state.map.width, 1, true) !== null;
  if (somewhere && (riders.some(isSettler) || preaching)) {
    // a missionary alone aboard is carried to a colony, never to a fresh site
    // pioneers taken off a settled land are put ashore where there is room for a new colony
    const shipped = !preaching && !riders.some((r) => mayFound(state, player, r)) && riders.some((r) => r.type === 'pioneer');
    const fresh = shipped ? siteBySea(state, player, ship.x, ship.y, state.map.width, 1, true) : null;
    const founding = !preaching && (riders.some((r) => mayFound(state, player, r)) || fresh !== null);
    const inPort = port !== null;
    // they will go ashore themselves: onto a site alongside, or into the colony when they have come to join one
    const ports = mine.filter((c) => canReach(state, ship.x, ship.y, c));
    if ((!inPort && (founding || ports.length === 0) && siteBeside(state, ship)) || (inPort && !founding && waitingPioneers.length === 0)) return null;
    // founders are taken to a fresh site; the rest to the colony that needs them most
    // a power with no colony yet takes the nearest fair site rather than hold out for the best
    const haste = mine.length === 0 ? AI_PLAN.firstColonyHaste : 1;
    // (a site is worth double to a plain colonist)
    const plain = riders.some((r) => r.type === 'colonist');
    const site = fresh ?? (founding ? siteBySea(state, player, ship.x, ship.y, AI_PLAN.shipSearch, haste, false, plain) ?? siteBySea(state, player, ship.x, ship.y, state.map.width, haste, false, plain) : null);
    const luck = (c: Colony): number => aiRng(state, `${ship.id}:port:${c.id}`).int(0, AI_SETTLE.portLuck);
    // (with no port of ours she can reach, they are put ashore at the best site she can)
    const goal = site ?? deliveryPort(state, ship, ports, luck) ?? (ports.length === 0 ? siteBySea(state, player, ship.x, ship.y, state.map.width, 1, false) : null) ?? nearestColony(mine, ship.x, ship.y);
    if (!goal) return null;
    if (colonyAt(state, goal.x, goal.y)) {
      const port: Action = { type: 'goTo', unitId: ship.id, x: goal.x, y: goal.y };
      if (ok(state, port)) return port;
    }
    const berths = DIRS.map(([dx, dy]) => [goal.x + dx, goal.y + dy] as const)
      .filter(([x, y]) => {
        const t = tileOf(state, x, y);
        return t !== undefined && isWater(t) && !isInlandLake(state.map, x, y);
      })
      .sort((a, b) => far(a[0], a[1], ship.x, ship.y) - far(b[0], b[1], ship.x, ship.y));
    for (const [x, y] of berths.slice(0, AI_PLAN.berthsTried)) {
      const go: Action = { type: 'goTo', unitId: ship.id, x, y };
      if (ok(state, go)) return go;
    }
    return null;
  }
  if (ship.movesLeft <= 0) return null;
  const reachable = (c: Colony): boolean => canReach(state, ship.x, ship.y, c);
  // supplies in the hold go to the port that needs them most
  const needy = cargoPort(state, ship, mine.filter(reachable));
  const deliver: Action | null = needy ? { type: 'goTo', unitId: ship.id, x: needy.x, y: needy.y } : null;
  if (deliver && ok(state, deliver)) return deliver;
  // out on the sea lane with nobody to deliver she is on her way home
  const onLane = tileOf(state, ship.x, ship.y)?.base === 'seaLane';
  // otherwise she fetches from the port with most waiting for a ship, unless it is time to make for Europe
  const fetch = pickupFor(state, player, ship, reachable);
  if (!onLane && !europeBound(state, player, ship, fetch === null)) {
    const call: Action | null = fetch ? { type: 'goTo', unitId: ship.id, x: fetch.x, y: fetch.y } : null;
    return call && ok(state, call) ? call : null;
  }
  if (player.atWar) return null;
  // eastward along the lane is the way home, so those steps are tried first
  for (const [dx, dy] of [...DIRS].sort((a, b) => b[0] - a[0])) {
    const sail: Action = { type: 'moveUnit', unitId: ship.id, dx, dy, sail: true };
    const tile = tileOf(state, ship.x, ship.y);
    if (tile?.base === 'seaLane' && ok(state, sail)) return sail;
  }
  const lane: Action = { type: 'goTo', unitId: ship.id, x: player.entry[0], y: player.entry[1] };
  if ((ship.x !== player.entry[0] || ship.y !== player.entry[1]) && ok(state, lane)) return lane;
  // at the lane's inner edge: one more step east puts her on course
  const east: Action = { type: 'moveUnit', unitId: ship.id, dx: 1, dy: 0, sail: true };
  if (ok(state, east)) return east;
  const step: Action = { type: 'moveUnit', unitId: ship.id, dx: 1, dy: 0, sail: false };
  return ok(state, step) ? step : null;
}

function riderAction(state: GameState, rider: Unit, player: Player, mine: readonly Colony[]): Action | null {
  const ship = state.units[rider.aboard ?? ''];
  if (!ship || ship.voyage !== null || rider.movesLeft <= 0) return null;
  // off an invasion beach the troops go ashore beside the colony they have come for
  const landing = ship.orders === 'goto' ? null : landingStep(state, rider, ship, player);
  if (landing) return landing;
  const port = colonyAt(state, ship.x, ship.y);
  if (port && port.owner === player.id) {
    // delivered: join, unless more colonies are wanted and this one can spare the hands
    const join: Action = { type: 'joinColony', unitId: rider.id };
    // a soldier stays a soldier once the power has its foothold, and a missionary a missionary: down the gangway on foot
    if (rider.type === 'missionary' || (isFighter(rider) && !mayFound(state, player, rider))) {
      for (const [dx, dy] of DIRS) {
        const ashore: Action = { type: 'moveUnit', unitId: rider.id, dx, dy };
        const t = tileOf(state, ship.x + dx, ship.y + dy);
        if (t && !isWater(t) && ok(state, ashore)) return ashore;
      }
      return null;
    }
    // come to join: in he goes; founders stay aboard for the site, unless the ship can reach none
    const founding = Object.values(state.units).some((u) => u.aboard === ship.id && mayFound(state, player, u));
    if (isSettler(rider) && !founding && ok(state, join)) return join;
    if (isSettler(rider) && ok(state, join) && siteBySea(state, player, ship.x, ship.y, state.map.width, 1, false) === null) return join;
    return null;
  }
  if (ship.orders === 'goto') return null;
  const stranded = !mine.some((c) => canReach(state, ship.x, ship.y, c));
  let beside = mayFound(state, player, rider) || stranded ? siteBeside(state, ship) : null;
  if (!beside && rider.type === 'pioneer') {
    // a pioneer shipped off settled land goes ashore where there is room for a new colony
    const site = siteBeside(state, ship);
    const land = site ? landmassAt(state.map, ship.x + site[0], ship.y + site[1]) : 0;
    if (site && !mine.some((c) => landmassAt(state.map, c.x, c.y) === land) && regionAppeal(state, player, land) > 0) beside = site;
  }
  if (!beside && stranded) {
    // no port of ours she can reach and no site alongside: ashore on land where we have a colony, to walk the rest
    for (const [dx, dy] of DIRS) {
      const land = landmassAt(state.map, ship.x + dx, ship.y + dy);
      const step: Action = { type: 'moveUnit', unitId: rider.id, dx, dy };
      if (land > 0 && mine.some((c) => landmassAt(state.map, c.x, c.y) === land) && ok(state, step)) return step;
    }
  }
  if (!beside) return null;
  const ashore: Action = { type: 'moveUnit', unitId: rider.id, dx: beside[0], dy: beside[1] };
  return ok(state, ashore) ? ashore : null;
}

function landAction(state: GameState, unit: Unit, player: Player, mine: readonly Colony[]): Action | null {
  // still without a foothold after some turns: any ground a colony may stand on will do, even at the end of a day's march
  const foothold: Action = { type: 'foundColony', unitId: unit.id };
  if (mine.length === 0 && isSettler(unit) && state.turn >= AI_PLAN.firstColonyAnywhereFrom && ok(state, foothold)) return foothold;
  if (unit.movesLeft <= 0) return null;
  const attack = landAttackChoice(state, unit, player);
  if (attack) return attack;
  if (unit.type === 'missionary') return missionaryAction(state, unit);
  // friendly people next to the way: a colonist stops to learn from them, a scout to speak with the chief
  const visit = villageVisit(state, unit);
  if (visit) return visit;
  if (unit.orders === 'goto' || unit.orders === 'plow' || unit.orders === 'road') return null;
  const here = colonyAt(state, unit.x, unit.y);
  const founding = mayFound(state, player, unit);
  const home = nearestColony(mine, unit.x, unit.y);
  const guards = (c: Colony): number => Object.values(state.units).filter((u) => u.x === c.x && u.y === c.y && u.owner === player.id && isFighter(u)).length;

  // soldiers hold what the power has once it has a foothold, and go where it wants fighting done
  if (isFighter(unit) && !founding) {
    const mineHere = here !== null && here.owner === player.id;
    if (garrisons(state, player).has(unit.id)) {
      const dig: Action = { type: 'setOrders', unitId: unit.id, orders: 'fortify' };
      return unit.orders === 'none' && ok(state, dig) ? dig : null;
    }
    const request = landOrders(state, player)[unit.id];
    if (request && (request.x !== unit.x || request.y !== unit.y)) {
      if (request.kind === 'defend') {
        const march: Action = { type: 'goTo', unitId: unit.id, x: request.x, y: request.y };
        if (ok(state, march)) return march;
      } else if (far(request.x, request.y, unit.x, unit.y) > 1) {
        const steps = DIRS.map(([dx, dy]) => [request.x + dx, request.y + dy] as const).sort((a, b) => far(a[0], a[1], unit.x, unit.y) - far(b[0], b[1], unit.x, unit.y));
        for (const [x, y] of steps) {
          const go: Action = { type: 'goTo', unitId: unit.id, x, y };
          if (ok(state, go)) return go;
        }
      } else return null; // beside it and not attacking: it waits for company, or for the word
    }
    if (mineHere) {
      // with nothing to do in a quiet region, troops enough to fill a transport in port go aboard for a landing elsewhere
      const spare = Object.values(state.units).filter((u) => u.owner === player.id && u.x === unit.x && u.y === unit.y && u.aboard === null && isTroop(u) && !garrisons(state, player).has(u.id));
      const transport = Object.values(state.units).find((u) => u.owner === player.id && u.x === unit.x && u.y === unit.y && isShip(u) && u.repair === 0 && UNIT_TYPES[u.type].holds > 0 && u.type !== 'privateer' && holdsFree(state, u) > 0 && holdsFree(state, u) <= spare.length);
      const board = !request && transport !== undefined && isQuiet(state, player, landmassAt(state.map, unit.x, unit.y)) && invasionFor(state, player, unit.x, unit.y) !== null;
      if (board !== (unit.orders === 'sentry')) return { type: 'setOrders', unitId: unit.id, orders: board ? 'sentry' : 'none' };
      return null;
    }
    const post = [...mine].sort((a, b) => guards(a) - guards(b) || far(a.x, a.y, unit.x, unit.y) - far(b.x, b.y, unit.x, unit.y))[0];
    const march: Action | null = post ? { type: 'goTo', unitId: unit.id, x: post.x, y: post.y } : null;
    return march && ok(state, march) ? march : null;
  }
  if (!isSettler(unit)) {
    const back: Action | null = home && !here ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
    return back && ok(state, back) ? back : null;
  }
  if (unit.type === 'scout') {
    const land = landmassAt(state.map, unit.x, unit.y);
    // on land that is settled and quiet a scout goes home
    if (isQuiet(state, player, land)) {
      const back: Action | null = home && !here ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
      return back && ok(state, back) ? back : null;
    }
    // otherwise it rides a step at a time, by chance, along rivers and roads, over easy ground, and toward empty land it has not seen
    const from = tileOf(state, unit.x, unit.y);
    const seat = state.players.findIndex((p) => p.id === player.id);
    const throws = aiRng(state, `${unit.id}:ride:${unit.movesLeft}`);
    let best: Action | null = null;
    let top = -999;
    DIRS.forEach(([dx, dy], d) => {
      const to = tileOf(state, unit.x + dx, unit.y + dy);
      const step: Action = { type: 'moveUnit', unitId: unit.id, dx, dy };
      const roll = throws.int(1, AI_SCOUT.chance);
      if (!from || !to || isWater(to) || !ok(state, step)) return;
      let score = roll;
      if (from.river !== 'none' && to.river !== 'none' && d % 2 === 0) score += AI_SCOUT.river;
      else if ((from.road || here) && (to.road || colonyAt(state, unit.x + dx, unit.y + dy))) score += AI_SCOUT.road;
      else score -= AI_SCOUT.costTimes * TERRAIN[terrainOf(to)].moveCost;
      // four squares on: empty land of its own kind draws it, the more of it unseen the better
      const px = unit.x + AI_SCOUT.ahead * dx;
      const py = unit.y + AI_SCOUT.ahead * dy;
      const ahead = tileOf(state, px, py);
      if (ahead && !isWater(ahead)) {
        const crowded = Object.values(state.units).some((u) => u.owner === player.id && u.voyage === null && far(u.x, u.y, px, py) <= 2) || mine.some((c) => far(c.x, c.y, px, py) <= 2);
        if (!crowded) score += AI_SCOUT.emptyAhead;
      }
      for (const [ex, ey] of DIRS) {
        const q = tileOf(state, px + ex, py + ey);
        if (!q) continue;
        if (!isWater(q) && !isExploredBy(q, seat)) score += AI_SCOUT.unseen;
        if (Object.values(state.units).some((u) => u.voyage === null && u.x === px + ex && u.y === py + ey)) score -= AI_SCOUT.unseen;
      }
      if (score > top) {
        top = score;
        best = step;
      }
    });
    return best;
  }
  const found: Action = { type: 'foundColony', unitId: unit.id };
  const mineHere = here !== null && here.owner === player.id;
  const target = unit.type === 'colonist' && !founding ? joinTarget(state, player, unit) : null;
  // a colonist no colony on his land has room for: in a colony he is made a pioneer, to be shipped where there is room; elsewhere he founds
  const crowdedOut = unit.type === 'colonist' && !founding && target === null && unit.profession !== 'indianConvert' && state.crownPlayer === null;
  if (crowdedOut && mineHere) {
    const tooled: Action = { type: 'equip', unitId: unit.id, role: 'pioneer' };
    if (ok(state, tooled)) return tooled;
  }
  if (founding || crowdedOut || mine.length === 0) {
    if (!here && siteScore(state, unit.x, unit.y, unit.type === 'colonist') > 0 && ok(state, found)) return found;
    for (const reach of [AI_PLAN.landSearch, 2 * AI_PLAN.landSearch]) {
      const site = bestSite(state, unit.x, unit.y, reach, null, mine.length === 0 ? AI_PLAN.firstColonyHaste : 1, undefined, unit.type === 'colonist');
      const go: Action | null = site ? { type: 'goTo', unitId: unit.id, x: site.x, y: site.y } : null;
      if (go && ok(state, go)) return go;
    }
  }
  if (unit.type === 'pioneer') {
    // in port with a transport lying there he waits to board, where the land is settled or colonies are still wanted; else he stays or goes home
    if (mineHere) {
      const carrier = Object.values(state.units).some((u) => u.owner === player.id && u.x === unit.x && u.y === unit.y && isShip(u) && u.repair === 0 && holdsFree(state, u) > 0 && u.type !== 'manOWar' && (u.type !== 'privateer' || privateersCarry(state, player)));
      const leave = carrier && (isQuiet(state, player, landmassAt(state.map, unit.x, unit.y)) || coloniesStillWanted(state, player) > 0);
      if (leave !== (unit.orders === 'sentry')) return { type: 'setOrders', unitId: unit.id, orders: leave ? 'sentry' : 'none' };
      return null;
    }
    // in the field he lays a road where he stands, unless a people not yet at odds with us hold the ground, or a rival's colony is close
    const land = landmassAt(state.map, unit.x, unit.y);
    const back: Action | null = home ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
    if (isQuiet(state, player, land)) return back && ok(state, back) ? back : null;
    const village = Object.values(state.settlements).sort((p, q) => far(p.x, p.y, unit.x, unit.y) - far(q.x, q.y, unit.x, unit.y))[0];
    const theirGround = village !== undefined && far(village.x, village.y, unit.x, unit.y) <= AI_PIONEER.tribeLand[TRIBES[village.tribe].tech] && tribalAlarm(state, village.tribe, player.id) < AI_PIONEER.alarmFrom;
    const colony = Object.values(state.colonies).sort((p, q) => far(p.x, p.y, unit.x, unit.y) - far(q.x, q.y, unit.x, unit.y))[0];
    const rivalNear = colony !== undefined && colony.owner !== player.id && far(colony.x, colony.y, unit.x, unit.y) < AI_PIONEER.rivalWithin;
    const road: Action = { type: 'pioneerWork', unitId: unit.id, job: 'road' };
    if (!theirGround && !rivalNear && ok(state, road)) return road;
    return back && ok(state, back) ? back : ok(state, found) ? found : null;
  }
  // the rest join the colony on their land that wants them most
  const join: Action = { type: 'joinColony', unitId: unit.id };
  if (target && (target.x !== unit.x || target.y !== unit.y)) {
    const go: Action = { type: 'goTo', unitId: unit.id, x: target.x, y: target.y };
    if (ok(state, go)) return go;
  }
  if (mineHere) return ok(state, join) ? join : null;
  const walk: Action | null = home ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
  if (walk && ok(state, walk)) return walk;
  // nowhere to go: make the best of where we stand
  return ok(state, found) ? found : null;
}

/** The job plans made so far this turn, kept with the turn's own record of who has been seen to. */
const plans = new WeakMap<Set<string>, Map<string, Map<string, Job>>>();

/** The next action for the power whose turn it is. Ends the turn when nothing useful is left to do. */
export function europeanAction(state: GameState, idle: Set<string> = new Set()): Action {
  const player = state.players[state.current];
  if (!player || state.over) return { type: 'endTurn' };
  // trade talks one of its wagons has opened are seen through before anything else
  const talks = parleyAction(state);
  if (talks) return talks;
  const mine = coloniesOf(state, player.id);
  // each colony in turn: what it builds, and who does what (docs/RULES.md "Computer powers: the colony")
  for (const colony of mine) {
    if (idle.has(`#colony:${colony.id}`)) continue;
    // first who stands guard: units taken back in, and one colonist sent out armed
    const guard = musterAction(state, colony, idle, aiRng(state, `${colony.id}:muster`));
    if (guard) return guard;
    const build = buildAction(state, colony);
    if (build) return build;
    // the jobs are dealt out once a turn, when the project is settled, and then carried through
    const turnPlans = plans.get(idle) ?? new Map<string, Map<string, Job>>();
    plans.set(idle, turnPlans);
    const plan = turnPlans.get(colony.id) ?? jobPlan(state, colony);
    turnPlans.set(colony.id, plan);
    const job = jobAction(state, colony, plan);
    if (job) return job;
    idle.add(`#colony:${colony.id}`);
  }
  // (nothing done in the New World this turn changes what is to be done in Europe: once that is finished it is not looked at again)
  const inEurope = idle.has('#europe') ? null : europeAction(state, player, idle);
  if (inEurope) return inEurope;
  idle.add('#europe');
  const units = Object.values(state.units).filter((u) => u.owner === player.id && u.voyage === null).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const unit of units) {
    if (idle.has(unit.id)) continue;
    const action = unit.type === 'wagonTrain' ? wagonAction(state, unit) : unit.aboard !== null ? riderAction(state, unit, player, mine) : isShip(unit) ? shipAction(state, unit, player, mine, idle) : landAction(state, unit, player, mine);
    if (action) return action;
    // nothing for it now: do not ask again this turn unless something it waits on changes (a ship arriving, say)
    if (unit.aboard === null || unit.movesLeft <= 0) idle.add(unit.id);
  }
  return { type: 'endTurn' };
}

/** What an action was meant to change about its unit: used to notice orders that came to nothing. */
const stamp = (state: GameState, id: string | undefined): string => {
  const u = id === undefined ? undefined : state.units[id];
  return u ? `${u.x},${u.y},${u.movesLeft},${u.orders},${u.aboard},${u.type},${u.owner},${JSON.stringify(u.cargo)},${JSON.stringify(u.voyage)}` : 'gone';
};

/** Play out the turn of the power to move with this policy; stops after `cap` actions whatever happens. `watch` is shown each action it decides on, for the simulations. */
export function playTurn(state: GameState, cap = AI_PLAN.actionsPerTurn, watch?: (before: GameState, action: Action, events: readonly GameEvent[]) => void): { state: GameState; events: GameEvent[]; actions: Action[] } {
  let next = state;
  const events: GameEvent[] = [];
  const actions: Action[] = [];
  const seat = state.current;
  const idle = new Set<string>();
  for (let i = 0; i < cap && next.current === seat && !next.over; i++) {
    const action = europeanAction(next, idle);
    const result = applyAction(next, action);
    watch?.(next, action, result.events);
    actions.push(action);
    events.push(...result.events);
    const unitId = 'unitId' in action ? action.unitId : undefined;
    // an order that left its unit exactly as it was (a blocked march, say) would be given again
    // for ever: the unit stands down for the turn instead
    if (unitId !== undefined && stamp(next, unitId) === stamp(result.state, unitId) && result.state.units[unitId]) {
      // if it was a march that something blocks, step round the obstacle; otherwise stand down
      const unit = result.state.units[unitId] as Unit;
      const goal = action.type === 'goTo' ? ([action.x, action.y] as const) : null;
      const steps = goal
        ? [...DIRS].sort((p, q) => far(unit.x + p[0], unit.y + p[1], goal[0], goal[1]) - far(unit.x + q[0], unit.y + q[1], goal[0], goal[1]))
        : [];
      const aside = steps.map(([dx, dy]): Action => ({ type: 'moveUnit', unitId, dx, dy, sail: false })).find((step) => validateAction(result.state, step).ok);
      const skip: Action = aside ?? { type: 'skipUnit', unitId };
      const rest: Action = validateAction(result.state, skip).ok ? skip : { type: 'endTurn' };
      const after = applyAction(result.state, rest);
      next = after.state;
      events.push(...after.events);
      actions.push(rest);
      idle.add(unitId);
      if (rest.type === 'endTurn') return { state: next, events, actions };
      continue;
    }
    next = result.state;
    // with every other power gone the turn comes straight back to the same seat: one turn is still one turn
    if (action.type === 'endTurn') return { state: next, events, actions };
  }
  if (next.current === seat && !next.over) {
    const done = applyAction(next, { type: 'endTurn' });
    next = done.state;
    events.push(...done.events);
    actions.push({ type: 'endTurn' });
  }
  return { state: next, events, actions };
}
