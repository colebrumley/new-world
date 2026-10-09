// The computer powers' policy (R-802). It plays through the same actions a human uses. Each
// call looks at the state afresh and names the next thing to do for the power whose turn it is,
// ending the turn when nothing useful is left. Nothing is remembered between calls: standing
// Go To orders carry intentions from turn to turn.
//
// What it does: lands its people on good coastal sites and founds colonies there; sends newcomers
// on to found more, up to a number that grows with the years, and then to swell the colonies it
// has; keeps its ships ferrying immigrants from Europe and selling what they carry; recruits when
// it has gold to spare; sets its colonies building; garrisons them; and attacks only what it has
// better than even odds against.
import { applyAction, validateAction, type Action, type GameEvent } from '../engine/actions';
import { analyseAttack } from '../engine/analysis';
import { coloniesOf, checkColonySite } from '../engine/colony';
import { availableItems } from '../engine/construction';
import { AI_PLAN } from '../engine/data/ai';
import { GOOD_IDS } from '../engine/data/goods';
import { NATIONS } from '../engine/data/nations';
import { UNSKILLED } from '../engine/data/professions';
import { NATIVES } from '../engine/data/tribes';
import { UNIT_TYPES } from '../engine/data/units';
import { colonyProduction } from '../engine/economy';
import { docksOf, shipsInEurope } from '../engine/europe';
import { recruitPrice } from '../engine/immigration';
import { isInlandLake } from '../engine/movement';
import { isHostile, tribalAlarm } from '../engine/alarm';
import { settlementAt, tribeOfOwner } from '../engine/settlements';
import { colonyAt, type Colony, type GameState, type Player, type Unit } from '../engine/state';
import { isWater, type Tile } from '../engine/tile';
import { isWagonProject, parleyAction, wagonAction, wagonBuild, wagonRefusal, wagonWorker } from './wagons';

const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;
const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const tileOf = (state: GameState, x: number, y: number): Tile | undefined =>
  x > 0 && y > 0 && x < state.map.width - 1 && y < state.map.height - 1 ? state.map.tiles[y * state.map.width + x] : undefined;
const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;
const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';
const isSettler = (u: Unit): boolean => UNIT_TYPES[u.type].colonistRole && u.profession !== null && u.profession !== 'indianConvert';
const isFighter = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'land' && UNIT_TYPES[u.type].attack > 1;

/** How many colonies a power wants by now: a few at first, more as the years pass and for an expansionist leader. */
export function coloniesWanted(state: GameState, player: Player): number {
  const bent = NATIONS[player.nation].leaderTraits.expansionist;
  return Math.min(AI_PLAN.coloniesMost, AI_PLAN.coloniesAtStart + bent + Math.floor(state.turn / AI_PLAN.turnsPerExtraColony));
}

/**
 * The tribal alarm from which this power treats a native people as an enemy. A militaristic
 * leader takes offence a level sooner than the plan says, one bent on civilizing a level later.
 */
function enemyFrom(player: Player): number {
  const level = Math.max(1, Math.min(NATIVES.alarmLevels.length, AI_PLAN.reprisalFromLevel + NATIONS[player.nation].leaderTraits.civilizing));
  return NATIVES.alarmLevels[level - 1] as number;
}

/** A militaristic leader, once established, goes looking for conquest among the native peoples until he has had his fill of it. */
function isConqueror(state: GameState, player: Player): boolean {
  return NATIONS[player.nation].leaderTraits.civilizing < 0 && state.turn >= AI_PLAN.conquestFromTurn && player.villagesBurned < AI_PLAN.conquestQuota;
}

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

/** An attack worth making from here: something next to the unit that it would probably beat. */
function goodAttack(state: GameState, unit: Unit, player: Player): Action | null {
  if (UNIT_TYPES[unit.type].attack <= 0 || unit.movesLeft < 3) return null;
  let best: Action | null = null;
  let top: number = AI_PLAN.attackOddsLeast;
  for (const [dx, dy] of DIRS) {
    const x = unit.x + dx;
    const y = unit.y + dy;
    const action: Action = { type: 'attack', unitId: unit.id, dx, dy };
    if (!ok(state, action)) continue;
    // only those we are really at war with: a hostile tribe, or a power we are fighting
    const colony = colonyAt(state, x, y);
    const village = settlementAt(state, x, y);
    const foe = Object.values(state.units).find((u) => u.x === x && u.y === y && u.owner !== unit.owner);
    const tribe = village?.tribe ?? (foe ? tribeOfOwner(foe.owner) : null);
    const enemy = colony?.owner ?? (foe && !tribe ? foe.owner : null);
    const atWar = tribe ? tribalAlarm(state, tribe, unit.owner) >= enemyFrom(player) || (village !== null && (isHostile(village, unit.owner) || isConqueror(state, player))) : enemy !== null && player.stance[enemy] === 'war';
    if (!atWar || (village && !isFighter(unit))) continue;
    const chance = analyseAttack(state, unit, dx, dy)?.chance ?? 0;
    if (chance >= top) {
      top = chance;
      best = action;
    }
  }
  return best;
}

function europeAction(state: GameState, player: Player): Action | null {
  const ships = shipsInEurope(state, player.id).filter((s) => s.repair === 0);
  if (ships.length === 0) return null;
  for (const ship of ships) {
    for (const good of GOOD_IDS) {
      const amount = Math.min(100, ship.cargo[good] ?? 0);
      const sale: Action = { type: 'sellGoods', unitId: ship.id, good, amount };
      if (amount > 0 && ok(state, sale)) return sale;
    }
  }
  const waiting = docksOf(state, player.id);
  const room = ships.reduce((n, s) => n + UNIT_TYPES[s.type].holds, 0);
  // a growing power wants a second and a third ship to carry its people
  const fleet = Object.values(state.units).filter((u) => u.owner === player.id && isShip(u)).length;
  const colonies = coloniesOf(state, player.id).length;
  const buyShip: Action = { type: 'purchaseUnit', unit: 'merchantman' };
  if (fleet < 1 + Math.floor(colonies / AI_PLAN.coloniesPerShip) && player.gold >= AI_PLAN.shipFund && ok(state, buyShip)) return buyShip;
  if (waiting.length < room && player.gold >= recruitPrice(state, player.id) + AI_PLAN.goldReserve) {
    // the most useful of the three: anyone with a trade before the unskilled
    const order = [0, 1, 2].sort((a, b) => rank(player.pool[b]) - rank(player.pool[a]));
    for (const slot of order) if (ok(state, { type: 'recruit', slot })) return { type: 'recruit', slot };
  }
  // a guard for every colony, and more when a native people has turned on us: arm those waiting on the docks
  const soldiers = Object.values(state.units).filter((u) => u.owner === player.id && isFighter(u)).length;
  const threatened = isConqueror(state, player) || Object.values(state.settlements).some((s) => isHostile(s, player.id) || tribalAlarm(state, s.tribe, player.id) >= enemyFrom(player));
  if (soldiers < Math.ceil(colonies / AI_PLAN.coloniesPerGuard) + (threatened ? AI_PLAN.reprisalParty : 0)) {
    for (const unit of waiting) {
      if (unit.type !== 'colonist' || !UNSKILLED.includes(unit.profession ?? 'freeColonist')) continue;
      const arm: Action = { type: 'equipInEurope', unitId: unit.id, role: 'soldier' };
      if (ok(state, arm)) return arm;
    }
  }
  if (waiting.length > 0) {
    const sail: Action = { type: 'sailFromEurope', unitId: (ships[0] as Unit).id };
    if (ok(state, sail)) return sail;
  }
  return null;
}
const rank = (profession: string | undefined): number => (profession === 'pettyCriminal' ? 0 : profession === 'indenturedServant' ? 1 : profession === 'freeColonist' ? 2 : 3);

function shipAction(state: GameState, ship: Unit, player: Player, mine: readonly Colony[]): Action | null {
  if (ship.repair > 0 || ship.orders === 'goto') return null;
  const riders = Object.values(state.units).filter((u) => u.aboard === ship.id);
  const attack = goodAttack(state, ship, player);
  if (attack) return attack;
  if (riders.some(isSettler)) {
    const wanted = coloniesWanted(state, player);
    const inPort = colonyAt(state, ship.x, ship.y)?.owner === player.id;
    // they will go ashore themselves: onto a site alongside, or into the colony if no more colonies are wanted
    if ((!inPort && siteBeside(state, ship)) || (inPort && mine.length >= wanted)) return null;
    // more colonies wanted: a fresh site; otherwise the nearest colony we have
    const bySea = mine.length < wanted || mine.length === 0 ? seaDistances(state, ship.x, ship.y) : null;
    // a power with no colony yet takes the nearest fair site rather than hold out for the best
    const haste = mine.length === 0 ? AI_PLAN.firstColonyHaste : 1;
    const site = mine.length < wanted ? bestSite(state, ship.x, ship.y, AI_PLAN.shipSearch, bySea, haste) ?? bestSite(state, ship.x, ship.y, state.map.width, bySea, haste) : null;
    const goal = site ?? nearestColony(mine, ship.x, ship.y) ?? bestSite(state, ship.x, ship.y, state.map.width, bySea, haste);
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
  // nobody aboard: make for Europe, where the immigrants are (the colonies sell their own surplus)
  if (ship.movesLeft <= 0 || player.atWar) return null;
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
  const port = colonyAt(state, ship.x, ship.y);
  if (port && port.owner === player.id) {
    // delivered: join, unless more colonies are wanted and this one can spare the hands
    const join: Action = { type: 'joinColony', unitId: rider.id };
    // a soldier stays a soldier once the power has its foothold: he goes down the gangway and takes his post on foot
    if (isFighter(rider) && mine.length >= AI_PLAN.coloniesBeforeGarrison) {
      for (const [dx, dy] of DIRS) {
        const ashore: Action = { type: 'moveUnit', unitId: rider.id, dx, dy };
        const t = tileOf(state, ship.x + dx, ship.y + dy);
        if (t && !isWater(t) && ok(state, ashore)) return ashore;
      }
      return null;
    }
    if (isSettler(rider) && mine.length >= coloniesWanted(state, player) && ok(state, join)) return join;
    // more colonies are wanted but the ship can reach no site: better a pair of hands here than a passenger for ever
    if (isSettler(rider) && ok(state, join) && bestSite(state, ship.x, ship.y, state.map.width, seaDistances(state, ship.x, ship.y)) === null) return join;
    return null;
  }
  if (ship.orders === 'goto') return null;
  const beside = siteBeside(state, ship);
  if (!beside) return null;
  const ashore: Action = { type: 'moveUnit', unitId: rider.id, dx: beside[0], dy: beside[1] };
  return ok(state, ashore) ? ashore : null;
}

function landAction(state: GameState, unit: Unit, player: Player, mine: readonly Colony[]): Action | null {
  // still without a foothold after some turns: any ground a colony may stand on will do, even at the end of a day's march
  const foothold: Action = { type: 'foundColony', unitId: unit.id };
  if (mine.length === 0 && isSettler(unit) && state.turn >= AI_PLAN.firstColonyAnywhereFrom && ok(state, foothold)) return foothold;
  if (unit.movesLeft <= 0) return null;
  const attack = goodAttack(state, unit, player);
  if (attack) return attack;
  if (unit.orders === 'goto' || unit.orders === 'plow' || unit.orders === 'road') return null;
  const here = colonyAt(state, unit.x, unit.y);
  const wanted = coloniesWanted(state, player);
  const home = nearestColony(mine, unit.x, unit.y);
  const guards = (c: Colony): number => Object.values(state.units).filter((u) => u.x === c.x && u.y === c.y && u.owner === player.id && isFighter(u)).length;

  // soldiers hold what the power has once it has a foothold
  if (isFighter(unit) && (mine.length >= AI_PLAN.coloniesBeforeGarrison || !isSettler(unit))) {
    // a people that has gone to war with us is answered: a soldier who can be spared marches on its nearest settlement
    const spare = !here || here.owner !== player.id || guards(here) > 1;
    // (not while fighting the Crown: then every soldier is wanted at home)
    if (spare && !player.atWar) {
      const hostile = Object.values(state.settlements)
        .filter((s) => (isConqueror(state, player) || tribalAlarm(state, s.tribe, player.id) >= enemyFrom(player) || isHostile(s, player.id)) && far(s.x, s.y, unit.x, unit.y) <= AI_PLAN.reprisalRange)
        .sort((a, b) => far(a.x, a.y, unit.x, unit.y) - far(b.x, b.y, unit.x, unit.y))[0];
      if (hostile && far(hostile.x, hostile.y, unit.x, unit.y) > 1) {
        const steps = DIRS.map(([dx, dy]) => [hostile.x + dx, hostile.y + dy] as const).sort((a, b) => far(a[0], a[1], unit.x, unit.y) - far(b[0], b[1], unit.x, unit.y));
        for (const [x, y] of steps) {
          const go: Action = { type: 'goTo', unitId: unit.id, x, y };
          if (ok(state, go)) return go;
        }
      }
      // beside it and not attacking means the odds are poor: wait there for a better moment, or for company
      if (hostile) return null;
    }
    if (here && here.owner === player.id) {
      const dig: Action = { type: 'setOrders', unitId: unit.id, orders: 'fortify' };
      return unit.orders === 'none' && ok(state, dig) ? dig : null;
    }
    const post = [...mine].sort((a, b) => guards(a) - guards(b) || far(a.x, a.y, unit.x, unit.y) - far(b.x, b.y, unit.x, unit.y))[0];
    const march: Action | null = post ? { type: 'goTo', unitId: unit.id, x: post.x, y: post.y } : null;
    return march && ok(state, march) ? march : null;
  }
  if (!isSettler(unit)) {
    const back: Action | null = home && !here ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
    return back && ok(state, back) ? back : null;
  }
  // settlers: found while more colonies are wanted, then swell the ones there are
  const found: Action = { type: 'foundColony', unitId: unit.id };
  if (mine.length < wanted) {
    if (!here && siteScore(state, unit.x, unit.y) > 0 && ok(state, found)) return found;
    for (const reach of [AI_PLAN.landSearch, 2 * AI_PLAN.landSearch]) {
      const site = bestSite(state, unit.x, unit.y, reach, null, mine.length === 0 ? AI_PLAN.firstColonyHaste : 1);
      const go: Action | null = site ? { type: 'goTo', unitId: unit.id, x: site.x, y: site.y } : null;
      if (go && ok(state, go)) return go;
    }
  }
  const join: Action = { type: 'joinColony', unitId: unit.id };
  if (here && here.owner === player.id) return ok(state, join) ? join : null;
  const walk: Action | null = home ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
  if (walk && ok(state, walk)) return walk;
  // nowhere to go: make the best of where we stand
  return ok(state, found) ? found : null;
}

/**
 * Liberty needs voices: a colony of some size keeps one colonist in its Town Hall for every few
 * it has, so long as the colony still feeds itself. Returns the appointment to make, if one is due.
 */
function statesmanFor(state: GameState, colony: Colony): Action | null {
  const people = colony.colonists.length;
  if (people < AI_PLAN.statesmanFrom || !colony.buildings.includes('townHall')) return null;
  const isStatesman = (c: Colony['colonists'][number]): boolean => c.job.kind === 'work' && c.job.trade === 'statesman';
  const seated = colony.colonists.filter(isStatesman).length;
  if (seated >= Math.min(3, Math.floor(people / AI_PLAN.colonistsPerStatesman))) return null;
  // an elder statesman first, then whoever is spared most easily: the idle, then hands with no trade
  const rank = (c: Colony['colonists'][number]): number => (c.profession === 'elderStatesman' ? 0 : c.job.kind === 'idle' ? 1 : UNSKILLED.includes(c.profession) && c.profession !== 'indianConvert' ? 2 : 9);
  const candidates = colony.colonists.filter((c) => !isStatesman(c) && rank(c) < 9).sort((a, b) => rank(a) - rank(b));
  for (const c of candidates) {
    const seat: Action = { type: 'assignJob', colonyId: colony.id, colonistId: c.id, job: { kind: 'work', trade: 'statesman' } };
    if (!ok(state, seat)) continue;
    const after = applyAction(state, seat).state;
    const report = colonyProduction(after, after.colonies[colony.id] as Colony);
    if (report.produced.food >= report.consumed.food) return seat;
  }
  return null;
}

/** The next action for the power whose turn it is. Ends the turn when nothing useful is left to do. */
export function europeanAction(state: GameState, idle: Set<string> = new Set()): Action {
  const player = state.players[state.current];
  if (!player || state.over) return { type: 'endTurn' };
  // trade talks one of its wagons has opened are seen through before anything else
  const talks = parleyAction(state);
  if (talks) return talks;
  const mine = coloniesOf(state, player.id);
  for (const colony of mine) {
    // a wagon train for the trade with the natives goes ahead of whatever else is on the stocks
    const wagon = wagonBuild(state, colony);
    if (wagon) return wagon;
    const hand = wagonWorker(state, colony);
    if (hand) return hand;
    // a wagon stays on the stocks only while one is still wanted
    if (colony.construction !== null && !(isWagonProject(colony) && wagonRefusal(state, colony) !== null)) continue;
    // the buildings it sets most store by come first; after them, whatever is next on the list
    const open = availableItems(state, colony).filter((i) => !(i.kind === 'unit' && i.unit === 'wagonTrain'));
    const item = AI_PLAN.buildFirst.map((id) => open.find((i) => i.kind === 'building' && i.id === id)).find((i) => i !== undefined) ?? open[0];
    const build: Action | null = item ? { type: 'setConstruction', colonyId: colony.id, item } : null;
    if (build && ok(state, build)) return build;
  }
  for (const colony of mine) {
    const seat = statesmanFor(state, colony);
    if (seat) return seat;
  }
  const inEurope = europeAction(state, player);
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
  return u ? `${u.x},${u.y},${u.movesLeft},${u.orders},${u.aboard},${u.type},${u.owner},${JSON.stringify(u.cargo)}` : 'gone';
};

/** Play out the turn of the power to move with this policy; stops after `cap` actions whatever happens. */
export function playTurn(state: GameState, cap = AI_PLAN.actionsPerTurn): { state: GameState; events: GameEvent[]; actions: Action[] } {
  let next = state;
  const events: GameEvent[] = [];
  const actions: Action[] = [];
  const seat = state.current;
  const idle = new Set<string>();
  for (let i = 0; i < cap && next.current === seat && !next.over; i++) {
    const action = europeanAction(next, idle);
    const result = applyAction(next, action);
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
