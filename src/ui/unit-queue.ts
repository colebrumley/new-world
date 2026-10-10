// Which unit asks for orders next. Pure, so the rotation can be tested without a browser.
import type { GameState, Unit, UnitId } from '../engine/state';

/** A unit the player still has to deal with this turn. */
export function needsOrders(unit: Unit, playerId: string): boolean {
  return unit.owner === playerId && unit.voyage === null && unit.movesLeft > 0 && unit.orders === 'none';
}

/**
 * The next unit to activate after `currentId`, going round in id order. Units the player has
 * told to wait are passed over until nobody else is left; then they come up again.
 */
export function nextUnit(state: GameState, playerId: string, currentId: UnitId | null, waiting: ReadonlySet<UnitId>): Unit | null {
  const order = (id: UnitId): number => Number(id.replace(/\D+/g, '')) || 0;
  const pending = Object.values(state.units).filter((u) => needsOrders(u, playerId)).sort((a, b) => order(a.id) - order(b.id));
  if (pending.length === 0) return null;
  const fresh = pending.filter((u) => !waiting.has(u.id));
  const pool = fresh.length > 0 ? fresh : pending;
  if (currentId === null) return pool[0] ?? null;
  return pool.find((u) => order(u.id) > order(currentId)) ?? pool.find((u) => u.id !== currentId) ?? pool[0] ?? null;
}

/** Order letter shown in a unit's box: - S G F P R. */
export function orderLetter(unit: Unit): string {
  switch (unit.orders) {
    case 'sentry': return 'S';
    case 'goto': return 'G';
    case 'fortify':
    case 'fortified': return 'F';
    case 'plow': return 'P';
    case 'road': return 'R';
    case 'trade': return 'T';
    default: return '-';
  }
}

/** The unit drawn for a square that holds several: the active one, else the first not carried. */
export function topUnit(units: readonly Unit[], activeId: UnitId | null): Unit | null {
  const shown = units.filter((u) => u.aboard === null && u.voyage === null);
  return shown.find((u) => u.id === activeId) ?? shown[0] ?? null;
}
