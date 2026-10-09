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
import { AI_DOCKS, AI_FLEET, AI_MISSIONS, AI_MUSTER, AI_PLAN, AI_SETTLE, AI_SUPPLY } from '../engine/data/ai';
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
import { isWater, type Tile } from '../engine/tile';
import { garrisons, invasionFor, isFull, isQuiet, isTroop, landAttackChoice, landingStep, landOrders } from './campaign';
import { missionaryAction, ordain, villageVisit, type Chances } from './missions';
import { isWarship, privateersCarry, warshipAction } from './navy';
import { buildAction, jobAction, jobPlan } from './colony';
import { musterAction } from './muster';
import { coloniesStillWanted, deliveryPort, joinTarget, mayFound, wantsColonists } from './settle';
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

/** How good a place for a colony this is; 0 if it will not do. Coast, workable land, room, and no neighbours too close. */
export function siteScore(state: GameState, x: number, y: number): number {
  const tile = tileOf(state, x, y);
  if (!tile || isWater(tile) || tile.relief !== 'flat' || tile.base === 'arctic' || tile.base === 'desert') return 0;
  if (!checkColonySite(state, x, y).ok) return 0;
  for (const c of Object.values(state.colonies)) if (far(c.x, c.y, x, y) < AI_PLAN.colonySpacing) return 0;
  for (const s of Object.values(state.settlements)) if (far(s.x, s.y, x, y) <= 1) return 0;
  let score = 0;
  let port = false;
  for (const [dx, dy] of DIRS) {
    const near = tileOf(state, x + dx, y + dy);
    if (!near) continue;
    if (isWater(near)) {
      if (!isInlandLake(state.map, x + dx, y + dy)) port = true;
      score += 1;
    } else if (near.relief === 'mountains' || near.base === 'arctic' || near.base === 'desert') score += 0;
    else score += near.homeland ? 1 : 2;
    if (near.resource) score += 2;
  }
  return port && score >= AI_PLAN.siteScoreLeast ? score : 0;
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
function bestSite(state: GameState, x: number, y: number, reach: number, bySea: Map<number, number> | null = null, haste = 1): { x: number; y: number; score: number } | null {
  let best: { x: number; y: number; score: number } | null = null;
  const x0 = Math.max(1, x - reach);
  const x1 = Math.min(state.map.width - 2, x + reach);
  const y0 = Math.max(1, y - reach);
  const y1 = Math.min(state.map.height - 2, y + reach);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const raw = siteScore(state, tx, ty);
      if (raw === 0) continue;
      let away = far(x, y, tx, ty);
      if (bySea) {
        const berths = DIRS.map(([dx, dy]) => bySea.get((ty + dy) * state.map.width + tx + dx)).filter((d): d is number => d !== undefined);
        if (berths.length === 0) continue;
        away = Math.min(...berths);
      }
      const score = raw * 2 - away * haste;
      if (!best || score > best.score) best = { x: tx, y: ty, score };
    }
  }
  return best;
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
    const kit = AI_MUSTER.muskets * askPrice(state, player.id, 'muskets');
    if (player.gold >= recruitPrice(state, player.id) + kit && ok(state, order)) {
      done.add('#draft');
      return order;
    }
  }
  if (ships.length === 0) return null;

  // goods the colonies ask for, a lot of each, while holds are left over from the passengers
  const wants = powerWants(state, player);
  const dockUnits = waiting.length + (state.turn % 2);
  const someoneFitted = tally(done, '#fitted:') > 0 || waiting.some((u) => u.type === 'pioneer');
  let seats = waiting.reduce((n, u) => n + UNIT_TYPES[u.type].size, 0);
  for (const ship of ships) {
    // a privateer or man-of-war carries nothing out
    const carrier = ship.type !== 'manOWar' && (ship.type !== 'privateer' || privateersCarry(state, player));
    const mayLoad = carrier && !short && mine.length > 0 && before;
    for (const good of AI_SUPPLY.goods) {
      if (!mayLoad || done.has(`#lot:${ship.id}:${good}`)) continue;
      done.add(`#lot:${ship.id}:${good}`);
      const free = holdsFree(state, ship) - Math.min(seats, holdsFree(state, ship));
      if (free <= 0 || (someoneFitted && !cargoTurn && free <= AI_SUPPLY.holdsKept)) continue;
      if (!cargoTurn && wants[good] - tally(done, `#bought:${good}:`) < Math.max(1, dockUnits)) continue;
      const order: Action = { type: 'buyGoods', unitId: ship.id, good, amount: AI_SUPPLY.lot };
      if (!ok(state, order)) continue;
      done.add(`#laden:${ship.id}`);
      done.add(`#bought:${good}:${ship.id}`);
      return order;
    }
    seats -= Math.min(seats, holdsFree(state, ship));
  }
  // every ship sails, loaded or not
  for (const ship of ships) {
    const sail: Action = { type: 'sailFromEurope', unitId: ship.id };
    if (ok(state, sail)) return sail;
  }
  return null;
}

function shipAction(state: GameState, ship: Unit, player: Player, mine: readonly Colony[]): Action | null {
  // warships fight and keep their stations; only when free of that do they do a transport's work
  const duty = isWarship(ship) ? warshipAction(state, ship, player) : undefined;
  if (duty !== undefined) return duty;
  if (ship.repair > 0 || ship.orders === 'goto') return null;
  const riders = Object.values(state.units).filter((u) => u.aboard === ship.id);
  // in one of our ports everything in the hold goes ashore
  if (colonyAt(state, ship.x, ship.y)?.owner === player.id) {
    for (const good of GOOD_IDS) {
      const unload: Action = { type: 'unloadCargo', unitId: ship.id, good, amount: ship.cargo[good] ?? 0 };
      if ((ship.cargo[good] ?? 0) > 0 && ok(state, unload)) return unload;
    }
  }
  // a full ship with soldiers aboard (or waiting on the quay to board as she sails) may make a landing beside a rival colony
  const quay = colonyAt(state, ship.x, ship.y)?.owner === player.id ? Object.values(state.units).filter((u) => u.owner === player.id && u.x === ship.x && u.y === ship.y && u.aboard === null && u.orders === 'sentry' && isTroop(u)) : [];
  if (mine.length >= AI_PLAN.coloniesBeforeGarrison && (riders.some(isTroop) || quay.length > 0) && isFull(state, ship, quay.length)) {
    const landing = invasionFor(state, player, ship.x, ship.y);
    if (landing && (landing.x !== ship.x || landing.y !== ship.y)) {
      const go: Action = { type: 'goTo', unitId: ship.id, x: landing.x, y: landing.y };
      if (ok(state, go)) return go;
    }
    // off the beach: she lies to while the troops go over the side
    if (landing && riders.some((r) => landingStep(state, r, ship, player) !== null)) return null;
  }
  const preaching = !riders.some(isSettler) && riders.some((u) => u.type === 'missionary') && mine.length > 0;
  if (riders.some(isSettler) || preaching) {
    // a missionary alone aboard is carried to a colony, never to a fresh site
    const founding = !preaching && riders.some((r) => mayFound(state, player, r));
    const inPort = colonyAt(state, ship.x, ship.y)?.owner === player.id;
    // they will go ashore themselves: onto a site alongside, or into the colony when they have come to join one
    if ((!inPort && founding && siteBeside(state, ship)) || (inPort && !founding)) return null;
    // founders are taken to a fresh site; the rest to the colony that needs them most
    const bySea = founding ? seaDistances(state, ship.x, ship.y) : null;
    // a power with no colony yet takes the nearest fair site rather than hold out for the best
    const haste = mine.length === 0 ? AI_PLAN.firstColonyHaste : 1;
    const site = founding ? bestSite(state, ship.x, ship.y, AI_PLAN.shipSearch, bySea, haste) ?? bestSite(state, ship.x, ship.y, state.map.width, bySea, haste) : null;
    const ports = mine.filter((c) => ok(state, { type: 'goTo', unitId: ship.id, x: c.x, y: c.y }));
    const luck = (c: Colony): number => aiRng(state, `${ship.id}:port:${c.id}`).int(0, AI_SETTLE.portLuck);
    const goal = site ?? deliveryPort(state, ship, ports, luck) ?? nearestColony(mine, ship.x, ship.y);
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
  // supplies in the hold go to the port that needs them most; with none to take them they go back to be sold
  const needy = cargoPort(state, ship, mine.filter((c) => ok(state, { type: 'goTo', unitId: ship.id, x: c.x, y: c.y })));
  if (needy) return { type: 'goTo', unitId: ship.id, x: needy.x, y: needy.y };
  // nobody aboard: make for Europe, where the immigrants are (the colonies sell their own surplus)
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
    if (isSettler(rider) && ok(state, join) && bestSite(state, ship.x, ship.y, state.map.width, seaDistances(state, ship.x, ship.y)) === null) return join;
    return null;
  }
  if (ship.orders === 'goto') return null;
  const beside = mayFound(state, player, rider) || mine.length === 0 ? siteBeside(state, ship) : null;
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
    // ours: it rides to the nearest friendly village on its land that none of ours has spoken with, and otherwise home
    const land = landmassAt(state.map, unit.x, unit.y);
    const calls = Object.values(state.settlements)
      .filter((v) => landmassAt(state.map, v.x, v.y) === land && !v.scouted.includes(player.id) && tribalAlarm(state, v.tribe, player.id) < AI_MISSIONS.visitAlarmBelow)
      .sort((a, b) => far(a.x, a.y, unit.x, unit.y) - far(b.x, b.y, unit.x, unit.y));
    for (const v of calls) {
      for (const [dx, dy] of DIRS) {
        const go: Action = { type: 'goTo', unitId: unit.id, x: v.x + dx, y: v.y + dy };
        if (ok(state, go)) return go;
      }
    }
    const back: Action | null = home && !here ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
    return back && ok(state, back) ? back : null;
  }
  // founders look for a site; so does a colonist no colony on his land has room for
  const found: Action = { type: 'foundColony', unitId: unit.id };
  const target = unit.type === 'colonist' && !founding ? joinTarget(state, player, unit) : null;
  const crowdedOut = unit.type === 'colonist' && !founding && target === null && unit.profession !== 'indianConvert' && state.crownPlayer === null;
  if (founding || crowdedOut || mine.length === 0) {
    if (!here && siteScore(state, unit.x, unit.y) > 0 && ok(state, found)) return found;
    for (const reach of [AI_PLAN.landSearch, 2 * AI_PLAN.landSearch]) {
      const site = bestSite(state, unit.x, unit.y, reach, null, mine.length === 0 ? AI_PLAN.firstColonyHaste : 1);
      const go: Action | null = site ? { type: 'goTo', unitId: unit.id, x: site.x, y: site.y } : null;
      if (go && ok(state, go)) return go;
    }
  }
  // the rest join the colony on their land that wants them most
  const join: Action = { type: 'joinColony', unitId: unit.id };
  if (target && (target.x !== unit.x || target.y !== unit.y)) {
    const go: Action = { type: 'goTo', unitId: unit.id, x: target.x, y: target.y };
    if (ok(state, go)) return go;
  }
  // (with no site in reach either, better a pair of hands here than an idler)
  if (here && here.owner === player.id) return ok(state, join) ? join : null;
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
  const inEurope = europeAction(state, player, idle);
  if (inEurope) return inEurope;
  const units = Object.values(state.units).filter((u) => u.owner === player.id && u.voyage === null).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const unit of units) {
    if (idle.has(unit.id)) continue;
    const action = unit.type === 'wagonTrain' ? wagonAction(state, unit) : unit.aboard !== null ? riderAction(state, unit, player, mine) : isShip(unit) ? shipAction(state, unit, player, mine) : landAction(state, unit, player, mine);
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
