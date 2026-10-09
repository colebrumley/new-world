// Native land (R-510): what a tribe asks for a tile, buying it, taking it, and the anger that
// working it unpaid brings. Whose land a tile is, is in settlements.ts.
import { adjustTribalAlarm, attitude, type AlarmEvent, type AlarmSink } from './alarm';
import { LAND } from './data/land';
import { TRIBES, type TribeId } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { createRng, type Rng } from './rng';
import { isNativeLand, landOwner, nativeDistance } from './settlements';
import type { GameState, Player, PlayerId, Settlement } from './state';

export type LandEvent =
  | AlarmEvent
  | { readonly type: 'landAcquired'; readonly player: PlayerId; readonly x: number; readonly y: number; readonly tribe: TribeId; readonly paid: number | null };

export type LandErrorCode = 'notNativeLand' | 'outOfReach' | 'cannotAfford';
export type LandCheck = { readonly ok: true } | { readonly ok: false; readonly code: LandErrorCode; readonly message: string };
const no = (code: LandErrorCode, message: string): LandCheck => ({ ok: false, code, message });

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);

/** The settlement a power must reckon with over this tile, or null if the land is free to it. */
export function landlord(state: GameState, playerId: PlayerId, x: number, y: number): Settlement | null {
  const tile = state.map.tiles[y * state.map.width + x];
  if (!tile || !isNativeLand(state, tile, playerId)) return null;
  return landOwner(Object.values(state.settlements), x, y);
}

/** Colonists a power has, in colonies and as colonist units on the map. */
function colonistCount(state: GameState, playerId: PlayerId): number {
  const settled = Object.values(state.colonies).reduce((n, c) => n + (c.owner === playerId ? c.colonists.length : 0), 0);
  const afield = Object.values(state.units).filter((u) => u.owner === playerId && u.voyage === null && UNIT_TYPES[u.type].colonistRole).length;
  return Math.min(255, settled + afield);
}

/** What the tribe asks for the tile. Nothing if it is not native land to this power. */
export function landPrice(state: GameState, playerId: PlayerId, x: number, y: number): number {
  const owner = landlord(state, playerId, x, y);
  const player = playerOf(state, playerId);
  const tile = state.map.tiles[y * state.map.width + x];
  if (!owner || !player || !tile) return 0;
  const human = player.kind === 'human';
  const level = DIFFICULTIES.indexOf(state.difficulty);
  const tech = TRIBES[owner.tribe].tech;
  const sold = state.tribes[owner.tribe]?.landSold ?? 0;
  const d = nativeDistance(owner.x, owner.y, x, y);
  let base = (human ? 2 * (level + LAND.humanBase) : LAND.aiBase - level) + tech + sold - d;
  base -= Math.max(0, (LAND.smallPowerColonists - colonistCount(state, playerId)) >> 1);
  if (tile.resource !== null) base *= 2;
  let price = (human ? LAND.unit : LAND.aiUnit) * Math.max(1, base);
  if (human) price *= attitude(state, owner.tribe, playerId) + 1;
  if (owner.capital) price += price >> 1;
  return price >> 1;
}

/** How much a tribe resents a tile being used without payment: more the nearer its settlement, double for prized land. */
export function grievance(state: GameState, playerId: PlayerId, x: number, y: number, road: boolean): { tribe: TribeId; amount: number } | null {
  const owner = landlord(state, playerId, x, y);
  const tile = state.map.tiles[y * state.map.width + x];
  if (!owner || !tile) return null;
  const d = nativeDistance(owner.x, owner.y, x, y);
  const k = (d <= 1 ? 3 : d === 2 ? 2 : 1) * (tile.resource !== null && !road ? 2 : 1);
  const level = playerOf(state, playerId)?.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : 0;
  return { tribe: owner.tribe, amount: k * (level + (road ? LAND.roadAlarm : LAND.takeAlarm)) };
}

/** Can the power deal over this tile now? It must be native land and within its grasp: beside one of its colonies, or under one of its units. */
export function checkAcquireLand(state: GameState, playerId: PlayerId, x: number, y: number, pay: boolean): LandCheck {
  if (!landlord(state, playerId, x, y)) return no('notNativeLand', 'that land is not the natives\' to sell');
  const near = Object.values(state.colonies).some((c) => c.owner === playerId && Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= 1)
    || Object.values(state.units).some((u) => u.owner === playerId && u.x === x && u.y === y && u.voyage === null && u.aboard === null);
  if (!near) return no('outOfReach', 'we have nobody there to take possession');
  if (pay && (playerOf(state, playerId)?.gold ?? 0) < landPrice(state, playerId, x, y)) return no('cannotAfford', `they ask ${landPrice(state, playerId, x, y)} gold for it`);
  return { ok: true };
}

function claim(state: GameState, playerId: PlayerId, x: number, y: number): GameState {
  const tiles = [...state.map.tiles];
  const i = y * state.map.width + x;
  tiles[i] = { ...(tiles[i] as (typeof tiles)[number]), claim: playerId };
  return { ...state, map: { ...state.map, tiles } };
}

/** Buy the tile at the tribe's price, or simply take it and bear the tribe's anger. Either way it is the power's from now on. */
export function acquireLand(state: GameState, playerId: PlayerId, x: number, y: number, pay: boolean, events: LandEvent[]): GameState {
  const owner = landlord(state, playerId, x, y) as Settlement;
  if (pay) {
    const price = landPrice(state, playerId, x, y);
    const record = state.tribes[owner.tribe];
    let next = claim(state, playerId, x, y);
    next = { ...next, players: next.players.map((p) => (p.id === playerId ? { ...p, gold: p.gold - price } : p)) };
    if (record) next = { ...next, tribes: { ...next.tribes, [owner.tribe]: { ...record, landSold: record.landSold + 1 } } };
    events.push({ type: 'landAcquired', player: playerId, x, y, tribe: owner.tribe, paid: price });
    return next;
  }
  const rng = createRng(state.rng);
  const wrong = grievance(state, playerId, x, y, false);
  let next = claim(state, playerId, x, y);
  events.push({ type: 'landAcquired', player: playerId, x, y, tribe: owner.tribe, paid: null });
  if (wrong) next = adjustTribalAlarm(next, wrong.tribe, playerId, wrong.amount, rng, events as AlarmSink);
  return { ...next, rng: rng.state() };
}

/** A pioneer has finished work on land that was never paid for: the tribe takes note. */
export function unpaidImprovement(state: GameState, playerId: PlayerId, x: number, y: number, road: boolean, rng: Rng, events: LandEvent[]): GameState {
  const wrong = grievance(state, playerId, x, y, road);
  return wrong ? adjustTribalAlarm(state, wrong.tribe, playerId, wrong.amount, rng, events as AlarmSink) : state;
}

/** Would a computer power buy rather than take? It pays when it can well afford to. */
export function aiBuysLand(state: GameState, playerId: PlayerId, x: number, y: number): boolean {
  return 2 * (playerOf(state, playerId)?.gold ?? 0) >= LAND.aiBuysAtHalves * landPrice(state, playerId, x, y);
}
