// Damage and repair of ships (shared by raids, colony capture and naval combat).
import { NAVAL, REPAIR_HEAD_START } from './data/naval';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { coloniesOf } from './colony';
import { addGoods, equipmentOf } from './cargo';
import { GOOD_IDS } from './data/goods';
import { OFF_MAP, type Colony, type GameState, type Goods, type Unit } from './state';

export type ShipEvent =
  /** A ship was badly hit: everything aboard is lost and it limps to `to` for repairs, or goes down if there is nowhere to go. */
  | { readonly type: 'shipDamaged'; readonly unitId: string; readonly owner: string; readonly to: 'europe' | string; readonly turns: number; readonly lost: Goods }
  | { readonly type: 'shipSunk'; readonly unitId: string; readonly owner: string; readonly lost: Goods }
  | { readonly type: 'shipRepaired'; readonly unitId: string; readonly owner: string };

/** Anything ship events can be pushed onto. */
export interface ShipSink {
  push(...events: ShipEvent[]): unknown;
}

const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';

/** Everything that goes down with a ship: its cargo, and the kit of those aboard. */
function aboard(state: GameState, ship: Unit): { lost: Goods; riders: Unit[] } {
  let lost: Goods = ship.cargo;
  const riders = Object.values(state.units).filter((u) => u.aboard === ship.id);
  for (const rider of riders) {
    const kit = equipmentOf(rider);
    for (const g of GOOD_IDS) {
      const amount = (kit[g] ?? 0) + (rider.cargo[g] ?? 0);
      if (amount > 0) lost = addGoods(lost, g, amount);
    }
  }
  return { lost, riders };
}

/** The nearest colony of the ship's owner that can repair it, other than `except`. */
function drydockFor(state: GameState, ship: Unit, except: string | null): Colony | null {
  let best: Colony | null = null;
  let bestD = Infinity;
  for (const c of coloniesOf(state, ship.owner)) {
    if (c.id === except || !c.buildings.includes(NAVAL.repairBuilding)) continue;
    const d = Math.max(Math.abs(c.x - ship.x), Math.abs(c.y - ship.y));
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export function sinkShip(state: GameState, shipId: string, events: ShipSink): GameState {
  const ship = state.units[shipId];
  if (!ship) return state;
  const { lost, riders } = aboard(state, ship);
  const units = { ...state.units };
  for (const r of riders) delete units[r.id];
  delete units[ship.id];
  events.push({ type: 'shipSunk', unitId: ship.id, owner: ship.owner, lost });
  return { ...state, units };
}

/**
 * A ship is crippled: all aboard is lost, and it is taken to the owner's nearest colony with a
 * drydock, or failing that to Europe. With neither (no drydock, and Europe closed by the war of
 * independence) it sinks. `leaving` is a colony it may not return to (one that has just fallen).
 */
export function damageShip(state: GameState, shipId: string, events: ShipSink, leaving: string | null = null, by: { combat: number; ship: boolean } | null = null): GameState {
  const ship = state.units[shipId];
  if (!ship || !isShip(ship)) return state;
  const owner = state.players.find((p) => p.id === ship.owner);
  const yard = drydockFor(state, ship, leaving);
  if (!yard && (!owner || owner.atWar)) return sinkShip(state, shipId, events);
  const { lost, riders } = aboard(state, ship);
  const units = { ...state.units };
  for (const r of riders) delete units[r.id];
  // the weaker the victor, the lighter the damage
  const own = UNIT_TYPES[ship.type].defense;
  const start = Math.max(by ? Math.max(0, own - (by.ship ? 1 : 2) * by.combat) : 0, (REPAIR_HEAD_START as Partial<Record<UnitTypeId, number>>)[ship.type] ?? 0);
  const turns = Math.max(1, yard ? Math.ceil((own - start) / 2) : own - start);
  const base: Unit = { ...ship, cargo: {}, movesLeft: 0, orders: 'none', destination: null, route: null, repair: turns };
  units[ship.id] = yard
    ? { ...base, x: yard.x, y: yard.y, voyage: null }
    : { ...base, x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: owner?.entry ?? [0, 0] } };
  events.push({ type: 'shipDamaged', unitId: ship.id, owner: ship.owner, to: yard ? yard.id : 'europe', turns, lost });
  return { ...state, units };
}

/**
 * The colony is about to be lost to its owner (taken, abandoned, starved out): the owner's ships
 * in port slip their cables, damaged, since without the colony they would be standing on land.
 */
export function shipsLeavePort(state: GameState, colony: Colony, events: ShipSink): GameState {
  let next = state;
  for (const u of Object.values(state.units)) {
    if (u.x !== colony.x || u.y !== colony.y || u.owner !== colony.owner || u.voyage !== null || u.aboard !== null) continue;
    if (isShip(u)) next = damageShip(next, u.id, events, colony.id);
  }
  return next;
}

/** A turn's work on every damaged ship of a power. A ship under repair cannot move or sail. */
export function repairShips(state: GameState, playerId: string, events: ShipSink): GameState {
  let next = state;
  for (const u of Object.values(state.units)) {
    if (u.owner !== playerId || u.repair <= 0) continue;
    const repair = u.repair - 1;
    next = { ...next, units: { ...next.units, [u.id]: { ...u, repair, movesLeft: 0 } } };
    if (repair === 0) events.push({ type: 'shipRepaired', unitId: u.id, owner: u.owner });
  }
  return next;
}
