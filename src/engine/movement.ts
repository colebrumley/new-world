// Movement rules (R-201): what a step costs, where each kind of unit may go, boarding and
// landing, and multi-turn Go To. Written from docs/RULES.md "Movement".
import { settlementAt } from './settlements';
import { holdsFree } from './cargo';
import { MOVEMENT } from './data/movement';
import { SIGHT } from './data/sight';
import { UNIT_TYPES } from './data/units';
import { revealAround, sightRadius } from './explore';
import { findPath, type Path } from './path';
import { createRng } from './rng';
import {
  cargoOf, colonyAt, hasFather, MOVE_THIRDS, OFF_MAP, playerIndexOf, tileAt, type GameMap, type GameState, type PlayerId, type Unit, type UnitId,
} from './state';
import { isWater, terrainDef, type Tile } from './tile';

export type MoveErrorCode =
  | 'badDirection'
  | 'offMap'
  | 'impassable'
  | 'settlement'
  | 'noMovesLeft'
  | 'occupied'
  | 'lake'
  | 'needsLandfall'
  | 'needsSailChoice'
  | 'landFirst'
  | 'carried'
  | 'shipFull';

export type MoveEvent =
  | { readonly type: 'unitMoved'; readonly unitId: UnitId; readonly from: readonly [number, number]; readonly to: readonly [number, number] }
  | { readonly type: 'moveFailed'; readonly unitId: UnitId; readonly to: readonly [number, number] }
  | { readonly type: 'unitBoarded'; readonly unitId: UnitId; readonly carrierId: UnitId }
  | { readonly type: 'unitWoken'; readonly unitId: UnitId }
  | { readonly type: 'unitLanded'; readonly unitId: UnitId; readonly carrierId: UnitId; readonly to: readonly [number, number] }
  | { readonly type: 'tilesExplored'; readonly player: PlayerId; readonly tiles: readonly number[] };

export type MoveKind = 'land' | 'sail' | 'board' | 'disembark' | 'landfall' | 'europe';

export interface MovePlan {
  readonly kind: MoveKind;
  readonly to: readonly [number, number];
  /** Movement the step costs, in thirds. */
  readonly cost: number;
  /** Ship being boarded. */
  readonly carrierId?: UnitId;
}

export type MoveCheck = { readonly ok: true; readonly plan: MovePlan } | { readonly ok: false; readonly code: MoveErrorCode; readonly message: string };

const no = (code: MoveErrorCode, message: string): MoveCheck => ({ ok: false, code, message });

export function fullMoves(unit: Unit): number {
  return UNIT_TYPES[unit.type].moves * MOVE_THIRDS;
}

/** Movement a unit gets at the start of a turn: Magellan gives every ship one move more. */
export function turnMoves(state: GameState, unit: Unit): number {
  const bonus = isShipUnit(unit) && hasFather(state, unit.owner, MOVEMENT.shipBonusFather) ? MOVEMENT.shipBonusMoves * MOVE_THIRDS : 0;
  return fullMoves(unit) + bonus;
}

export function isShipUnit(unit: Unit): boolean {
  return UNIT_TYPES[unit.type].domain === 'sea';
}

/** The outermost ring of the map is a border nothing may enter. */
export function isBorder(map: GameMap, x: number, y: number): boolean {
  return x <= 0 || y <= 0 || x >= map.width - 1 || y >= map.height - 1;
}

// --- open sea vs inland lakes --------------------------------------------------------------

const seaCache = new WeakMap<readonly Tile[], Uint8Array>();

/** 1 for every water tile connected (8 ways) to the map edge; inland lakes stay 0. Water never changes, so the result is cached per tile array. */
function openSea(map: GameMap): Uint8Array {
  const cached = seaCache.get(map.tiles);
  if (cached) return cached;
  const { width, height, tiles } = map;
  const sea = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (x: number, y: number): void => {
    const i = y * width + x;
    if (!sea[i] && isWater(tiles[i] as Tile)) {
      sea[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) seed(nx, ny);
      }
    }
  }
  seaCache.set(map.tiles, sea);
  return sea;
}

export function isInlandLake(map: GameMap, x: number, y: number): boolean {
  const tile = tileAt(map, x, y);
  return tile !== null && isWater(tile) && openSea(map)[y * map.width + x] === 0;
}

// --- step costs --------------------------------------------------------------------------

function hasRoad(state: GameState, tile: Tile, x: number, y: number): boolean {
  return tile.road || colonyAt(state, x, y) !== null;
}

/** Thirds of a move a land unit spends stepping between two adjacent land tiles. */
export function landStepCost(state: GameState, fx: number, fy: number, tx: number, ty: number): number {
  const from = tileAt(state.map, fx, fy) as Tile;
  const to = tileAt(state.map, tx, ty) as Tile;
  if (hasRoad(state, from, fx, fy) && hasRoad(state, to, tx, ty)) return MOVEMENT.roadCost;
  const straight = fx === tx || fy === ty;
  if (straight && from.river !== 'none' && to.river !== 'none') return MOVEMENT.riverCost;
  const cost = terrainDef(to).moveCost * MOVE_THIRDS;
  return colonyAt(state, tx, ty) ? Math.min(cost, MOVEMENT.settlementCap) : cost;
}

const freeHolds = holdsFree;

function foreignPresence(state: GameState, owner: PlayerId, x: number, y: number): boolean {
  const colony = colonyAt(state, x, y);
  if (colony && colony.owner !== owner) return true;
  return Object.values(state.units).some((u) => u.x === x && u.y === y && u.owner !== owner);
}

export interface MoveChoices {
  /** Answer to "make landfall?" when a loaded ship is moved onto land. */
  readonly landfall?: boolean;
  /** Answer to "sail for Europe?" on the high seas; leave unset to be asked. */
  readonly sail?: boolean;
}

/** Decide what moving `unit` one step in (dx, dy) would be, without changing anything. */
export function planMove(state: GameState, unit: Unit, dx: number, dy: number, choices: MoveChoices = {}): MoveCheck {
  const landfall = choices.landfall === true;
  const unitStep = (d: number): boolean => d === -1 || d === 0 || d === 1;
  if (!unitStep(dx) || !unitStep(dy) || (dx === 0 && dy === 0)) return no('badDirection', 'a move is one step in one of 8 directions');
  const tx = unit.x + dx;
  const ty = unit.y + dy;
  const target = tileAt(state.map, tx, ty);
  // A ship sailing off the east or west side of the map is asked whether to make for Europe.
  if (target && isShipUnit(unit) && (tx <= 0 || tx >= state.map.width - 1) && ty > 0 && ty < state.map.height - 1) {
    if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
    if (choices.sail === undefined) return no('needsSailChoice', 'sail for Europe?');
    return choices.sail ? { ok: true, plan: { kind: 'europe', to: [unit.x, unit.y], cost: 0 } } : no('offMap', 'cannot leave the map');
  }
  if (!target || isBorder(state.map, tx, ty)) return no('offMap', 'cannot leave the map');
  const to = [tx, ty] as const;
  const targetColony = colonyAt(state, tx, ty);
  // what a unit may do at a native settlement comes with R-503; until then nobody walks in
  if (settlementAt(state, tx, ty)) return no('settlement', 'a native settlement stands there');

  if (isShipUnit(unit)) {
    if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
    if (isWater(target)) {
      if (isInlandLake(state.map, tx, ty)) return no('lake', 'ships cannot enter inland lakes');
      if (foreignPresence(state, unit.owner, tx, ty)) return no('occupied', 'that square is held by another power');
      // Heading east along the Sea Lane (and not under Go To orders) also raises the question.
      const from = tileAt(state.map, unit.x, unit.y);
      if (dx === 1 && target.base === 'seaLane' && from?.base === 'seaLane' && unit.orders !== 'goto') {
        if (choices.sail === undefined) return no('needsSailChoice', 'sail for Europe?');
        if (choices.sail) return { ok: true, plan: { kind: 'europe', to: [unit.x, unit.y], cost: 0 } };
      }
      return { ok: true, plan: { kind: 'sail', to, cost: MOVEMENT.shipCost } };
    }
    if (targetColony && targetColony.owner === unit.owner) return { ok: true, plan: { kind: 'sail', to, cost: MOVEMENT.shipCost } };
    // landfall is on offer only while some passenger can still move this turn
    const passengers = cargoOf(state, unit.id).filter((u) => !isShipUnit(u) && u.movesLeft > 0);
    if (passengers.length === 0) return no('impassable', 'ships cannot sail onto land');
    if (foreignPresence(state, unit.owner, tx, ty)) return no('landFirst', 'units cannot storm an occupied square from aboard ship');
    if (!landfall) return no('needsLandfall', 'confirm making landfall');
    return { ok: true, plan: { kind: 'landfall', to, cost: 0 } };
  }

  // land units
  if (unit.aboard !== null) {
    const carrier = state.units[unit.aboard];
    const inPort = carrier ? colonyAt(state, carrier.x, carrier.y) !== null : false;
    if (isWater(target)) return no('impassable', 'land units cannot enter water');
    if (foreignPresence(state, unit.owner, tx, ty)) return no('landFirst', 'units cannot storm an occupied square from aboard ship');
    if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
    // from a ship docked in a colony a unit simply walks out; from a ship at sea it goes ashore
    if (inPort) return { ok: true, plan: { kind: 'land', to, cost: landStepCost(state, unit.x, unit.y, tx, ty) } };
    return { ok: true, plan: { kind: 'disembark', to, cost: terrainDef(target).moveCost * MOVE_THIRDS } };
  }

  if (isWater(target)) {
    const ship = Object.values(state.units).find((u) => u.x === tx && u.y === ty && u.owner === unit.owner && isShipUnit(u));
    if (!ship) return no('impassable', 'land units cannot enter water');
    if (UNIT_TYPES[unit.type].size > freeHolds(state, ship)) return no('shipFull', 'no room aboard');
    if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
    return { ok: true, plan: { kind: 'board', to, cost: MOVEMENT.boardFromColonyCost, carrierId: ship.id } };
  }
  if (foreignPresence(state, unit.owner, tx, ty)) return no('occupied', 'that square is held by another power');
  if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
  return { ok: true, plan: { kind: 'land', to, cost: landStepCost(state, unit.x, unit.y, tx, ty) } };
}

export interface MoveOutcome {
  readonly state: GameState;
  readonly events: readonly MoveEvent[];
  /** False when the unit lacked the movement and its attempt failed. */
  readonly moved: boolean;
}

function withUnits(state: GameState, changed: readonly Unit[]): GameState {
  const units = { ...state.units };
  for (const u of changed) units[u.id] = u;
  return { ...state, units };
}

function reveal(state: GameState, unit: Unit, events: MoveEvent[]): GameState {
  const seen = revealAround(state.map, playerIndexOf(state, unit.owner), unit.x, unit.y, sightRadius(unit.type, hasFather(state, unit.owner, SIGHT.deSoto)));
  if (seen.revealed.length === 0) return state;
  events.push({ type: 'tilesExplored', player: unit.owner, tiles: seen.revealed });
  return { ...state, map: seen.map };
}

/** Sentried land units on a ship's square (in practice a colony) go aboard as it sets off, while it has room. */
function embarkSentries(state: GameState, ship: Unit, events: MoveEvent[]): GameState {
  let room = freeHolds(state, ship);
  const boarded: Unit[] = [];
  for (const u of Object.values(state.units)) {
    if (room <= 0) break;
    if (u.x !== ship.x || u.y !== ship.y || u.owner !== ship.owner || u.aboard !== null || u.orders !== 'sentry' || isShipUnit(u)) continue;
    const size = UNIT_TYPES[u.type].size;
    if (size > room) continue;
    room -= size;
    boarded.push({ ...u, aboard: ship.id });
    events.push({ type: 'unitBoarded', unitId: u.id, carrierId: ship.id });
  }
  return boarded.length > 0 ? withUnits(state, boarded) : state;
}

/** Carry out a plan from planMove. A step the unit cannot fully pay for succeeds only by chance. */
export function executeMove(state: GameState, unitId: UnitId, plan: MovePlan): MoveOutcome {
  const unit = state.units[unitId] as Unit;
  const events: MoveEvent[] = [];
  const [tx, ty] = plan.to;
  const from = [unit.x, unit.y] as const;

  if (plan.kind === 'landfall') {
    // The ship stays put and spends nothing; its passengers are woken so each can be marched ashore.
    const woken = cargoOf(state, unit.id).filter((p) => !isShipUnit(p)).map((p): Unit => ({ ...p, orders: 'none', destination: null }));
    for (const p of woken) events.push({ type: 'unitWoken', unitId: p.id });
    return { state: withUnits(state, woken), events, moved: true };
  }

  // Crossing between land and water ends the unit's turn unless a colony is at one end.
  const viaColony = colonyAt(state, unit.x, unit.y) !== null || colonyAt(state, tx, ty) !== null;

  if (plan.kind === 'board') {
    const movesLeft = viaColony ? Math.max(0, unit.movesLeft - plan.cost) : 0;
    const boarded: Unit = { ...unit, x: tx, y: ty, aboard: plan.carrierId ?? null, movesLeft, orders: 'sentry', destination: null };
    events.push({ type: 'unitBoarded', unitId: unit.id, carrierId: plan.carrierId as UnitId });
    return { state: withUnits(state, [boarded]), events, moved: true };
  }

  // 'land', 'sail' and 'disembark': pay the cost, or gamble when short. A unit that has not
  // spent anything yet this turn always gets its first step.
  let next = state;
  const fresh = unit.movesLeft >= turnMoves(state, unit);
  if (unit.movesLeft < plan.cost && !fresh) {
    const rng = createRng(state.rng);
    const made = rng.chance(unit.movesLeft / plan.cost);
    next = { ...next, rng: rng.state() };
    if (!made) {
      events.push({ type: 'moveFailed', unitId: unit.id, to: plan.to });
      return { state: withUnits(next, [{ ...unit, movesLeft: 0 }]), events, moved: false };
    }
  }
  if (plan.kind === 'sail') next = embarkSentries(next, unit, events);
  const carrier = UNIT_TYPES[unit.type].holds > 0;
  const docking = carrier && colonyAt(state, tx, ty) !== null;
  const spent = docking || (plan.kind === 'disembark' && !viaColony);
  const moved: Unit = {
    ...unit, x: tx, y: ty, aboard: null, movesLeft: spent ? 0 : Math.max(0, unit.movesLeft - plan.cost),
    orders: unit.orders === 'goto' || unit.orders === 'trade' ? unit.orders : 'none', workTurns: 0,
  };
  const changed: Unit[] = [moved];
  // cargo rides along; arriving in a colony wakes the passengers
  for (const passenger of cargoOf(next, unit.id)) changed.push({ ...passenger, x: tx, y: ty, orders: docking ? 'none' : passenger.orders });
  next = withUnits(next, changed);
  if (plan.kind === 'disembark') events.push({ type: 'unitLanded', unitId: unit.id, carrierId: unit.aboard as UnitId, to: plan.to });
  else events.push({ type: 'unitMoved', unitId: unit.id, from, to: plan.to });
  return { state: reveal(next, moved, events), events, moved: true };
}

// --- Go To -------------------------------------------------------------------------------

/** Route for a Go To order, ignoring other units (they are dealt with when met). */
export function routeFor(state: GameState, unit: Unit, gx: number, gy: number): Path | null {
  const { map } = state;
  const ship = isShipUnit(unit);
  const settled = new Set(Object.values(state.settlements).map((s) => s.y * map.width + s.x));
  return findPath(
    map, unit.x, unit.y, gx, gy,
    (fx, fy, tx, ty) => {
      if (isBorder(map, tx, ty)) return null;
      const tile = tileAt(map, tx, ty) as Tile;
      if (ship) {
        if (isWater(tile)) return isInlandLake(map, tx, ty) ? null : MOVEMENT.shipCost;
        const colony = colonyAt(state, tx, ty);
        return colony && colony.owner === unit.owner ? MOVEMENT.shipCost : null;
      }
      if (isWater(tile) || settled.has(ty * map.width + tx)) return null;
      // a unit setting out from aboard ship takes its first step for free
      if (isWater(tileAt(map, fx, fy) as Tile)) return MOVE_THIRDS;
      return landStepCost(state, fx, fy, tx, ty);
    },
    { minStep: Math.min(MOVEMENT.roadCost, MOVEMENT.riverCost) },
  );
}

/** The destination of a ship ordered to Europe: no square of the map, she makes for the nearest Sea Lane. */
export const EUROPE_BOUND: readonly [number, number] = [OFF_MAP, OFF_MAP];

export function boundForEurope(unit: Unit): boolean {
  return unit.orders === 'goto' && unit.destination?.[0] === OFF_MAP && unit.destination[1] === OFF_MAP;
}

/** The nearest Sea Lane square a ship can sail to (her own, if she lies on one), or null if her waters reach none. */
export function laneFor(state: GameState, ship: Unit): readonly [number, number] | null {
  const { map } = state;
  const open = (x: number, y: number): boolean => {
    const tile = tileAt(map, x, y);
    if (!tile || isBorder(map, x, y)) return false;
    if (isWater(tile)) return !isInlandLake(map, x, y);
    return colonyAt(state, x, y)?.owner === ship.owner;
  };
  const seen = new Set<number>([ship.y * map.width + ship.x]);
  const queue: (readonly [number, number])[] = [[ship.x, ship.y]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i] as readonly [number, number];
    if (tileAt(map, x, y)?.base === 'seaLane' && !isBorder(map, x, y)) return [x, y];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = (y + dy) * map.width + x + dx;
        if (seen.has(key) || !open(x + dx, y + dy)) continue;
        seen.add(key);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  return null;
}

/**
 * Move a unit with a Go To order as far along its route as this turn allows. A ship bound for
 * Europe is brought to the Sea Lane and left there under orders; setting sail is the caller's.
 */
export function advanceGoto(state: GameState, unitId: UnitId): { state: GameState; events: MoveEvent[] } {
  const events: MoveEvent[] = [];
  let next = state;
  for (let guard = 0; guard < 64; guard++) {
    const unit = next.units[unitId];
    if (!unit || unit.orders !== 'goto' || !unit.destination) break;
    const clear = (): GameState => withUnits(next, [{ ...unit, orders: 'none', destination: null }]);
    const europe = boundForEurope(unit);
    const goal = europe ? laneFor(next, unit) : unit.destination;
    if (!goal) {
      next = clear();
      break;
    }
    const [gx, gy] = goal;
    if (unit.x === gx && unit.y === gy) {
      if (!europe) next = clear();
      break;
    }
    if (unit.movesLeft <= 0) break;
    const route = routeFor(next, unit, gx, gy);
    const step = route?.steps[0];
    if (!step) {
      next = clear();
      break;
    }
    const check = planMove(next, unit, step[0] - unit.x, step[1] - unit.y, { sail: false });
    if (!check.ok) {
      if (check.code !== 'noMovesLeft') next = clear();
      break;
    }
    const outcome = executeMove(next, unitId, check.plan);
    next = outcome.state;
    events.push(...outcome.events);
    if (!outcome.moved) break;
  }
  return { state: next, events };
}
