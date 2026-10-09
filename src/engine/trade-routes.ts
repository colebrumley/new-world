// Trade routes (R-311): an itinerary of up to four colonies with goods to unload and load at
// each, followed by wagon trains (land routes) or ships (sea routes) until told otherwise.
import { amountOf, loadCargo, roomFor, unloadCargo } from './cargo';
import { GOOD_IDS, type GoodId } from './data/goods';
import { TRADE_ROUTES } from './data/trade-routes';
import { UNIT_TYPES } from './data/units';
import { executeMove, isShipUnit, planMove, routeFor, type MoveEvent } from './movement';
import { colonyAt, type Colony, type GameState, type PlayerId, type RouteStop, type TradeRoute, type Unit, type UnitId } from './state';

export type TradeRouteErrorCode = 'tooManyRoutes' | 'badRoute' | 'noSuchRoute' | 'notCarrier' | 'wrongKindOfRoute';
export type TradeRouteCheck = { readonly ok: true } | { readonly ok: false; readonly code: TradeRouteErrorCode; readonly message: string };

export type TradeRouteEvent =
  | MoveEvent
  | { readonly type: 'routeTraded'; readonly unitId: UnitId; readonly colonyId: string; readonly unloaded: Partial<Record<GoodId, number>>; readonly loaded: Partial<Record<GoodId, number>> }
  | { readonly type: 'routeEnded'; readonly unitId: UnitId };

const no = (code: TradeRouteErrorCode, message: string): TradeRouteCheck => ({ ok: false, code, message });

export function routesOf(state: GameState, owner: PlayerId): TradeRoute[] {
  return Object.values(state.tradeRoutes).filter((r) => r.owner === owner);
}

/** "Jamestown Run", "Jamestown Triangle" for three stops, cycling through the stock suffixes. */
export function defaultRouteName(state: GameState, owner: PlayerId, stops: readonly RouteStop[]): string {
  const first = state.colonies[stops[0]?.colonyId ?? '']?.name ?? 'Trade';
  const taken = new Set(routesOf(state, owner).map((r) => r.name));
  const suffixes: readonly string[] = TRADE_ROUTES.nameSuffixes;
  const order = stops.length === 3 ? ['Triangle', ...suffixes.filter((s) => s !== 'Triangle')] : suffixes;
  for (let round = 1; round < 20; round++) {
    for (const suffix of order) {
      const name = round === 1 ? `${first} ${suffix}` : `${first} ${suffix} ${round}`;
      if (!taken.has(name)) return name;
    }
  }
  return `${first} Route`;
}

export function checkStops(state: GameState, owner: PlayerId, stops: readonly RouteStop[]): TradeRouteCheck {
  if (stops.length < 1 || stops.length > TRADE_ROUTES.maxStops) return no('badRoute', `a route has 1 to ${TRADE_ROUTES.maxStops} stops`);
  for (const stop of stops) {
    const colony = state.colonies[stop.colonyId];
    if (!colony || colony.owner !== owner) return no('badRoute', 'every stop must be one of your colonies');
    for (const list of [stop.unload, stop.load]) {
      if (list.length > TRADE_ROUTES.maxCargoesPerList) return no('badRoute', `at most ${TRADE_ROUTES.maxCargoesPerList} cargoes per list`);
      if (new Set(list).size !== list.length || list.some((g) => !GOOD_IDS.includes(g))) return no('badRoute', 'a cargo list names each tradeable good at most once');
    }
  }
  return { ok: true };
}

export function checkCreate(state: GameState, owner: PlayerId, kind: TradeRoute['kind'], stops: readonly RouteStop[], name: string | undefined): TradeRouteCheck {
  if (routesOf(state, owner).length >= TRADE_ROUTES.maxRoutes) return no('tooManyRoutes', `only ${TRADE_ROUTES.maxRoutes} trade routes can be defined`);
  if (kind !== 'land' && kind !== 'sea') return no('badRoute', 'a route is by land or by sea');
  if (name !== undefined && (name.trim().length === 0 || name.trim().length > 24)) return no('badRoute', 'a route name has 1 to 24 characters');
  return checkStops(state, owner, stops);
}

export function checkRouteAssign(unit: Unit, route: TradeRoute | undefined, stop: number): TradeRouteCheck {
  if (!route || route.owner !== unit.owner) return no('noSuchRoute', 'no such trade route');
  if (UNIT_TYPES[unit.type].holds === 0) return no('notCarrier', 'only ships and wagon trains run trade routes');
  if ((route.kind === 'sea') !== isShipUnit(unit)) return no('wrongKindOfRoute', route.kind === 'sea' ? 'that is a sea route' : 'that is a land route');
  if (!Number.isInteger(stop) || stop < 0 || stop >= route.stops.length) return no('badRoute', 'no such stop on that route');
  return { ok: true };
}

function tradeAt(state: GameState, unit: Unit, colony: Colony, stop: RouteStop, events: TradeRouteEvent[]): GameState {
  let next = state;
  const unloaded: Partial<Record<GoodId, number>> = {};
  const loaded: Partial<Record<GoodId, number>> = {};
  for (const good of stop.unload) {
    const carrier = next.units[unit.id] as Unit;
    const amount = amountOf(carrier.cargo, good);
    if (amount === 0) continue;
    next = unloadCargo(next, carrier, good, amount);
    unloaded[good] = amount;
  }
  for (const good of stop.load) {
    const carrier = next.units[unit.id] as Unit;
    const here = next.colonies[colony.id] as Colony;
    const amount = Math.min(amountOf(here.goods, good), roomFor(next, carrier, good));
    if (amount <= 0) continue;
    next = loadCargo(next, carrier, good, amount);
    loaded[good] = amount;
  }
  if (Object.keys(unloaded).length + Object.keys(loaded).length > 0) events.push({ type: 'routeTraded', unitId: unit.id, colonyId: colony.id, unloaded, loaded });
  return next;
}

function put(state: GameState, unit: Unit): GameState {
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

/**
 * Carry a unit on with its trade route for this turn: trade if it is standing in the stop it
 * was making for, then set out for the next, as far as its movement goes.
 */
export function runTradeRoute(state: GameState, unitId: UnitId, events: TradeRouteEvent[]): GameState {
  let next = state;
  for (let guard = 0; guard < 80; guard++) {
    const unit = next.units[unitId];
    if (!unit || unit.orders !== 'trade' || !unit.route) break;
    const route = next.tradeRoutes[unit.route.routeId];
    const live = route?.stops.filter((s) => next.colonies[s.colonyId]?.owner === unit.owner) ?? [];
    if (!route || live.length === 0) {
      next = put(next, { ...unit, orders: 'none', route: null });
      events.push({ type: 'routeEnded', unitId });
      break;
    }
    const index = unit.route.stop % route.stops.length;
    const stop = route.stops[index] as RouteStop;
    const colony = next.colonies[stop.colonyId];
    if (!colony || colony.owner !== unit.owner) {
      // that colony is gone: pass on to the next stop
      next = put(next, { ...unit, route: { routeId: route.id, stop: (index + 1) % route.stops.length } });
      continue;
    }
    if (unit.x === colony.x && unit.y === colony.y) {
      next = tradeAt(next, unit, colony, stop, events);
      const here = next.units[unitId] as Unit;
      next = put(next, { ...here, route: { routeId: route.id, stop: (index + 1) % route.stops.length } });
      if (route.stops.length === 1) break; // a one-stop route just keeps trading where it lies
      continue;
    }
    if (unit.movesLeft <= 0) break;
    const path = routeFor(next, unit, colony.x, colony.y);
    const step = path?.steps[0];
    if (!step) break; // no way through this turn; try again next turn
    const check = planMove(next, unit, step[0] - unit.x, step[1] - unit.y, { sail: false });
    if (!check.ok) break;
    const outcome = executeMove(next, unitId, check.plan);
    next = outcome.state;
    events.push(...outcome.events);
    if (!outcome.moved) break;
  }
  return next;
}

/** Is any colony at this unit's position? Convenience for callers deciding whether to trade now. */
export function inPort(state: GameState, unit: Unit): boolean {
  return colonyAt(state, unit.x, unit.y) !== null;
}
