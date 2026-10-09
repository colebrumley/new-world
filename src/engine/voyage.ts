// Sailing between the New World and Europe (R-203). A ship on a voyage is off the map: it and
// everything aboard carry a `voyage` record and the off-map coordinate.
import { VOYAGE } from './data/europe';
import { UNIT_TYPES } from './data/units';
import { turnMoves } from './movement';
import { createRng } from './rng';
import { cargoOf, hasFather, OFF_MAP, tileAt, type GameState, type PlayerId, type Unit, type UnitId, type Voyage } from './state';

export type VoyageEvent =
  | { readonly type: 'shipSailed'; readonly unitId: UnitId; readonly to: 'europe' | 'newWorld'; readonly turns: number }
  | { readonly type: 'shipReachedEurope'; readonly unitId: UnitId }
  | { readonly type: 'shipReachedNewWorld'; readonly unitId: UnitId; readonly at: readonly [number, number] }
  | { readonly type: 'shipTurnedBack'; readonly unitId: UnitId; readonly to: 'europe' | 'newWorld' };

function withUnits(state: GameState, changed: readonly Unit[]): GameState {
  const units = { ...state.units };
  for (const u of changed) units[u.id] = u;
  return { ...state, units };
}

/** Turns one crossing takes for this owner now. Always consumes one roll so replays stay in step. */
function crossingTurns(state: GameState, owner: PlayerId): { turns: number; state: GameState } {
  const rng = createRng(state.rng);
  const roll = rng.int(1, 100);
  const ships = Object.values(state.units).filter((u) => u.owner === owner && UNIT_TYPES[u.type].domain === 'sea').length;
  const slow = roll >= VOYAGE.slowRollFrom && ships >= VOYAGE.slowMinShips && !hasFather(state, owner, VOYAGE.slowUnlessFather);
  return { turns: slow ? VOYAGE.slowTurns : VOYAGE.turns, state: { ...state, rng: rng.state() } };
}

/** Take a ship off the map (with all aboard) and start it toward Europe from where it is. */
export function sailForEurope(state: GameState, shipId: UnitId, events: VoyageEvent[]): GameState {
  const ship = state.units[shipId] as Unit;
  const timed = crossingTurns(state, ship.owner);
  const voyage: Voyage = { phase: 'toEurope', turnsLeft: timed.turns, origin: [ship.x, ship.y] };
  const away = (u: Unit): Unit => ({ ...u, x: OFF_MAP, y: OFF_MAP, voyage, movesLeft: 0, orders: u.id === shipId ? 'none' : u.orders, destination: null });
  events.push({ type: 'shipSailed', unitId: shipId, to: 'europe', turns: timed.turns });
  // the power's ships built or bought in Europe will come out where this one left
  const noted: GameState = { ...timed.state, players: timed.state.players.map((p) => (p.id === ship.owner ? { ...p, entry: [ship.x, ship.y] } : p)) };
  return withUnits(noted, [ship, ...cargoOf(state, shipId)].map(away));
}

/** Send a ship lying in Europe back to the sea square it came from. */
export function sailForNewWorld(state: GameState, shipId: UnitId, events: VoyageEvent[]): GameState {
  const ship = state.units[shipId] as Unit;
  const timed = crossingTurns(state, ship.owner);
  const voyage: Voyage = { phase: 'toNewWorld', turnsLeft: timed.turns, origin: (ship.voyage as Voyage).origin };
  events.push({ type: 'shipSailed', unitId: shipId, to: 'newWorld', turns: timed.turns });
  return withUnits(timed.state, [ship, ...cargoOf(state, shipId)].map((u) => ({ ...u, voyage })));
}

/** Turn a ship around in mid-ocean. */
export function reverseVoyage(state: GameState, shipId: UnitId, events: VoyageEvent[]): GameState {
  const ship = state.units[shipId] as Unit;
  const old = ship.voyage as Voyage;
  const phase = old.phase === 'toEurope' ? 'toNewWorld' : 'toEurope';
  const voyage: Voyage = { phase, turnsLeft: VOYAGE.reverseTurns, origin: old.origin };
  events.push({ type: 'shipTurnedBack', unitId: shipId, to: phase === 'toEurope' ? 'europe' : 'newWorld' });
  return withUnits(state, [ship, ...cargoOf(state, shipId)].map((u) => ({ ...u, voyage })));
}

/** Where a returning ship comes back: its departure square, else the nearest Sea Lane square free of foreign units. */
export function arrivalSquare(state: GameState, owner: PlayerId, origin: readonly [number, number]): [number, number] | null {
  const free = (x: number, y: number): boolean => {
    const tile = tileAt(state.map, x, y);
    if (!tile || tile.base !== 'seaLane') return false;
    if (x <= 0 || y <= 0 || x >= state.map.width - 1 || y >= state.map.height - 1) return false;
    return !Object.values(state.units).some((u) => u.x === x && u.y === y && u.owner !== owner);
  };
  const [ox, oy] = origin;
  const limit = Math.max(state.map.width, state.map.height);
  for (let r = 0; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // the ring at distance r only
        if (free(ox + dx, oy + dy)) return [ox + dx, oy + dy];
      }
    }
  }
  return null;
}

/** Start of a player's turn: every ship of theirs at sea gets a turn closer, and those due arrive. */
export function advanceVoyages(state: GameState, owner: PlayerId, events: VoyageEvent[]): GameState {
  let next = state;
  for (const ship of Object.values(state.units)) {
    const voyage = ship.voyage;
    if (ship.owner !== owner || !voyage || ship.aboard !== null || voyage.phase === 'inEurope') continue;
    const group = [ship, ...cargoOf(next, ship.id)];
    const turnsLeft = voyage.turnsLeft - 1;
    if (turnsLeft > 0) {
      next = withUnits(next, group.map((u) => ({ ...u, voyage: { ...voyage, turnsLeft } })));
      continue;
    }
    if (voyage.phase === 'toEurope') {
      const docked: Voyage = { phase: 'inEurope', turnsLeft: 0, origin: voyage.origin };
      next = withUnits(next, group.map((u) => ({ ...u, voyage: docked })));
      events.push({ type: 'shipReachedEurope', unitId: ship.id });
      continue;
    }
    const at = arrivalSquare(next, owner, voyage.origin);
    if (!at) {
      // nowhere to appear this turn: stand off and try again next turn
      next = withUnits(next, group.map((u) => ({ ...u, voyage: { ...voyage, turnsLeft: 1 } })));
      continue;
    }
    next = withUnits(next, group.map((u) => ({ ...u, x: at[0], y: at[1], voyage: null, movesLeft: turnMoves(next, u) })));
    events.push({ type: 'shipReachedNewWorld', unitId: ship.id, at });
  }
  return next;
}
