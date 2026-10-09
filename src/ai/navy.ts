// Warships and privateers of the computer powers (R-806; docs/RULES.md "Computer powers:
// warships and privateers"). Each turn a power lists the stations it wants kept, each with a
// priority, and its privateers, frigates and men-of-war take the nearest that matter most.
import { validateAction, type Action } from '../engine/actions';
import { coloniesOf } from '../engine/colony';
import { isPortColony } from '../engine/construction';
import { AI_NAVY } from '../engine/data/ai';
import { NAVAL } from '../engine/data/naval';
import { UNIT_TYPES, type UnitTypeId } from '../engine/data/units';
import { dealing } from '../engine/diplomacy';
import { isInlandLake } from '../engine/movement';
import { seaDefender } from '../engine/naval';
import { colonyAt, type Colony, type GameState, type Player, type PlayerId, type Unit } from '../engine/state';
import { isWater } from '../engine/tile';

const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;
const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;
const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';
const atSea = (u: Unit): boolean => u.voyage === null && u.aboard === null;
/** The ships that keep stations: privateers, frigates and men-of-war. */
export const isWarship = (u: Unit): boolean => (NAVAL.warships as readonly UnitTypeId[]).includes(u.type);
const isPower = (state: GameState, id: PlayerId): boolean => state.players.some((p) => p.id === id);
const openSea = (state: GameState, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return false;
  const tile = state.map.tiles[y * state.map.width + x];
  return tile !== undefined && isWater(tile) && !isInlandLake(state.map, x, y);
};

export interface Station {
  readonly x: number;
  readonly y: number;
  readonly priority: number;
  readonly why: 'enemyShip' | 'blockade' | 'homePort';
}

/** Firm peace: a treaty, and no intention of breaking it. A power not yet met is not at peace. */
export function firmPeace(state: GameState, player: Player, other: PlayerId): boolean {
  return player.stance[other] === 'peace' && !dealing(state, player.id, other).intent;
}

/** After the Declaration only the human's units are fought. */
const spared = (state: GameState, owner: PlayerId): boolean => state.crownPlayer !== null && state.players.find((p) => p.id === owner)?.kind !== 'human';

/** Can the power see this foreign ship? Within sight of one of its units, or near one of its colonies. */
export function seesShip(state: GameState, player: Player, ship: Unit): boolean {
  if (coloniesOf(state, player.id).some((c) => far(c.x, c.y, ship.x, ship.y) <= AI_NAVY.colonySight)) return true;
  return Object.values(state.units).some((u) => u.owner === player.id && u.voyage === null && far(u.x, u.y, ship.x, ship.y) <= UNIT_TYPES[u.type].sight);
}

/** The open-sea square two squares off a port colony where a blockader lies: the one with most open sea next to it that also touches the colony. */
export function blockadeSquare(state: GameState, colony: { readonly x: number; readonly y: number }): readonly [number, number] | null {
  const r = AI_NAVY.blockadeDistance;
  let best: readonly [number, number] | null = null;
  let most = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = colony.x + dx;
      const y = colony.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !openSea(state, x, y)) continue;
      const count = DIRS.filter(([ex, ey]) => openSea(state, x + ex, y + ey) && far(x + ex, y + ey, colony.x, colony.y) === 1).length;
      if (count > most) {
        most = count;
        best = [x, y];
      }
    }
  }
  return best;
}

/** The foreign warships at sea within range of a colony. */
const warshipsNear = (state: GameState, colony: Colony, range: number): Unit[] =>
  Object.values(state.units).filter((u) => u.owner !== colony.owner && isShip(u) && atSea(u) && UNIT_TYPES[u.type].attack > 0 && far(u.x, u.y, colony.x, colony.y) <= range);

/** The stations a power wants kept this turn, the most pressing first (and in the order they were thought of within a priority). */
export function navalStations(state: GameState, player: Player): Station[] {
  const out: Station[] = [];
  // every enemy ship in sight, and every foreign privateer whatever the treaty
  for (const u of Object.values(state.units)) {
    if (u.owner === player.id || !isPower(state, u.owner) || !isShip(u) || !atSea(u) || colonyAt(state, u.x, u.y) || spared(state, u.owner)) continue;
    if (player.stance[u.owner] !== 'war' && u.type !== 'privateer') continue;
    if (seesShip(state, player, u) && !out.some((s) => s.x === u.x && s.y === u.y)) out.push({ x: u.x, y: u.y, priority: AI_NAVY.enemyShipPriority, why: 'enemyShip' });
  }
  // off each port colony of a power it is not at firm peace with
  for (const c of Object.values(state.colonies)) {
    if (c.owner === player.id || !isPower(state, c.owner) || firmPeace(state, player, c.owner) || !isPortColony(state, c)) continue;
    const square = blockadeSquare(state, c);
    if (!square) continue;
    const priority = AI_NAVY.blockadeBase + Math.min(AI_NAVY.blockadeMost, (c.colonists.length + AI_NAVY.blockadePopulationAdd) >> AI_NAVY.blockadePopulationShift);
    out.push({ x: square[0], y: square[1], priority, why: 'blockade' });
  }
  // its own ports with a foreign armed ship about
  for (const c of coloniesOf(state, player.id)) {
    if (!isPortColony(state, c)) continue;
    const near = warshipsNear(state, c, AI_NAVY.homeRange);
    if (near.length === 0) continue;
    out.push({ x: c.x, y: c.y, priority: near.some((u) => u.type === 'frigate') ? AI_NAVY.homeFrigatePriority : AI_NAVY.homePriority, why: 'homePort' });
  }
  return out.map((s, i) => ({ s, i })).sort((a, b) => b.s.priority - a.s.priority || a.i - b.i).map((e) => e.s);
}

/** What every station weighs before anyone is sent: the power's land units by the eight, within limits. */
export function baseLoad(state: GameState, player: Player): number {
  const land = Object.values(state.units).filter((u) => u.owner === player.id && UNIT_TYPES[u.type].domain === 'land').length;
  return Math.max(AI_NAVY.loadLeast, Math.min(AI_NAVY.loadMost, land >> 3));
}

/**
 * The station a ship at (x, y) takes: the lowest load x distance / (priority + 1), provided
 * the distance is within what the priority is worth. `loads` holds each station's load so far.
 */
export function chooseStation(stations: readonly Station[], loads: readonly number[], base: number, x: number, y: number): number {
  let best = -1;
  let least = 9999;
  stations.forEach((s, i) => {
    const score = Math.trunc(((loads[i] as number) * far(s.x, s.y, x, y)) / (s.priority + 1));
    if (score < least && (3 * s.priority) >> 1 >= Math.trunc(score / base)) {
      least = score;
      best = i;
    }
  });
  return best;
}

/** The station each of the power's warships is to keep, worked out for the whole fleet in order of id. */
export function navalOrders(state: GameState, player: Player): Record<string, Station> {
  const stations = navalStations(state, player);
  const base = baseLoad(state, player);
  const loads = stations.map(() => base);
  const fleet = Object.values(state.units)
    .filter((u) => u.owner === player.id && isWarship(u) && atSea(u) && u.repair === 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const orders: Record<string, Station> = {};
  // a ship already under way to a station is counted there first
  for (const ship of fleet) {
    if (ship.orders !== 'goto' || !ship.destination) continue;
    const i = stations.findIndex((s) => s.x === ship.destination?.[0] && s.y === ship.destination[1]);
    if (i < 0) continue;
    orders[ship.id] = stations[i] as Station;
    loads[i] = (loads[i] as number) + 1;
  }
  for (const ship of fleet) {
    if (orders[ship.id] || ship.orders === 'goto' || Object.values(state.units).some((u) => u.aboard === ship.id)) continue;
    const i = chooseStation(stations, loads, base, ship.x, ship.y);
    if (i < 0) continue;
    orders[ship.id] = stations[i] as Station;
    loads[i] = (loads[i] as number) + 1;
  }
  return orders;
}

/** May this ship set upon the ship of that power? War, or a privateer on either side; after the Declaration only the human's. */
export function mayEngage(state: GameState, player: Player, ship: Unit, target: Unit): boolean {
  if (target.owner === player.id || !isPower(state, target.owner) || spared(state, target.owner)) return false;
  return player.stance[target.owner] === 'war' || ship.type === 'privateer' || target.type === 'privateer';
}

/** An enemy ship on a neighbouring square is attacked whatever the odds, with a whole move in hand. */
export function navalAttackChoice(state: GameState, ship: Unit, player: Player): Action | null {
  if (!isWarship(ship) || ship.movesLeft < AI_NAVY.attackMovesLeast) return null;
  for (const [dx, dy] of DIRS) {
    const target = seaDefender(state, ship.x + dx, ship.y + dy, ship);
    const attack: Action = { type: 'attack', unitId: ship.id, dx, dy };
    if (target && mayEngage(state, player, ship, target) && ok(state, attack)) return attack;
  }
  return null;
}

/** Are the power's ports so beset by frigates that even its privateers must carry for it? */
export function privateersCarry(state: GameState, player: Player): boolean {
  const beset = coloniesOf(state, player.id).filter((c) => isPortColony(state, c) && warshipsNear(state, c, AI_NAVY.homeRange).some((u) => u.type === 'frigate'));
  return beset.length > AI_NAVY.carryPorts || beset.reduce((n, c) => n + c.colonists.length, 0) > AI_NAVY.carryPopulation;
}

/**
 * The next thing a warship does: fight what is alongside, keep its station, or lie in port.
 * `undefined` means it is free for a transport's work this turn (a frigate with nothing to
 * guard, a ship with people aboard, a privateer when the ports are beset).
 */
export function warshipAction(state: GameState, ship: Unit, player: Player): Action | null | undefined {
  if (!isWarship(ship)) return undefined;
  if (ship.repair > 0) return null;
  const attack = navalAttackChoice(state, ship, player);
  if (attack) return attack;
  if (ship.orders === 'goto') return null;
  if (Object.values(state.units).some((u) => u.aboard === ship.id)) return undefined;
  if (ship.type === 'privateer' && privateersCarry(state, player)) return undefined;
  const station = navalOrders(state, player)[ship.id];
  if (station) {
    if (station.x === ship.x && station.y === ship.y) return null;
    const go: Action = { type: 'goTo', unitId: ship.id, x: station.x, y: station.y };
    if (ok(state, go)) return go;
  }
  if (ship.type === 'frigate') return undefined;
  // nothing to keep: lie in the nearest home port
  if (colonyAt(state, ship.x, ship.y)?.owner === player.id) return null;
  const ports = coloniesOf(state, player.id).filter((c) => isPortColony(state, c)).sort((a, b) => far(a.x, a.y, ship.x, ship.y) - far(b.x, b.y, ship.x, ship.y));
  for (const port of ports) {
    const home: Action = { type: 'goTo', unitId: ship.id, x: port.x, y: port.y };
    if (ok(state, home)) return home;
  }
  return null;
}
