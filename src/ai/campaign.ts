// Campaigns of the computer powers by land and sea (R-807; docs/RULES.md "Computer powers:
// campaigns"). Each turn a power lists what it wants done on land (colonies and hostile
// settlements to attack, colonies of its own to defend) and beaches to invade; its troops and
// its full troop ships take what is nearest and matters most, as its warships do their stations.
import { validateAction, type Action } from '../engine/actions';
import { analyseAttack } from '../engine/analysis';
import { holdsUsed } from '../engine/cargo';
import { coloniesOf } from '../engine/colony';
import { tribalAlarm } from '../engine/alarm';
import { defendersFor, peopleAt, threatTo } from '../engine/computer';
import { AI_CAMPAIGN } from '../engine/data/ai';
import { UNIT_TYPES } from '../engine/data/units';
import { isBorder, isInlandLake } from '../engine/movement';
import { landmassAt, landmasses } from '../engine/regions';
import { settlementAt, tribeOfOwner, tribeOwner } from '../engine/settlements';
import { colonyAt, type Colony, type GameState, type Player, type PlayerId, type Unit } from '../engine/state';
import { isWater } from '../engine/tile';
import { baseLoad, firmPeace, unseenYet } from './navy';

const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;
const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isPower = (state: GameState, id: PlayerId): boolean => state.players.some((p) => p.id === id);
const onMap = (u: Unit): boolean => u.voyage === null;
const isLand = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'land';
/** Soldiers, dragoons, artillery and the regular types: what answers a call to attack or defend. */
export const isTroop = (u: Unit): boolean => isLand(u) && UNIT_TYPES[u.type].attack > 1;
const landOf = (state: GameState, at: { readonly x: number; readonly y: number }): number => landmassAt(state.map, at.x, at.y);
/** Has the power made up its mind to fight this people, or has the people turned on it? */
export const atWarWithTribe = (state: GameState, player: Player, tribe: string): boolean =>
  (player.tribeWars ?? []).includes(tribe) || tribalAlarm(state, tribe as Parameters<typeof tribalAlarm>[1], player.id) >= AI_CAMPAIGN.settlementAlarmFrom;

/** After the Declaration only the human's units and colonies are fought. */
const spared = (state: GameState, owner: PlayerId): boolean => state.crownPlayer !== null && state.players.find((p) => p.id === owner)?.kind !== 'human';

const memos = new WeakMap<GameState, Map<string, unknown>>();
/** Work something out once per state: a turn asks the same questions of the same state for every unit. */
export function memo<T>(state: GameState, key: string, make: () => T): T {
  let known = memos.get(state);
  if (!known) memos.set(state, (known = new Map()));
  if (!known.has(key)) known.set(key, make());
  return known.get(key) as T;
}

const sizes = new WeakMap<Int16Array, number[]>();
/** How many squares a landmass has. */
export function landmassSize(state: GameState, land: number): number {
  const ids = landmasses(state.map);
  let known = sizes.get(ids);
  if (!known) {
    known = [];
    for (const id of ids) known[id] = (known[id] ?? 0) + 1;
    sizes.set(ids, known);
  }
  return land > 0 ? known[land] ?? 0 : 0;
}

/** Is the colony big enough to be worth a campaign? Its people and the units on its square against a bar that falls as the years pass. */
export function worthTaking(state: GameState, colony: Colony): boolean {
  const units = Object.values(state.units).filter((u) => onMap(u) && u.x === colony.x && u.y === colony.y).length;
  return colony.colonists.length + units > AI_CAMPAIGN.sizeBase - Math.trunc(state.turn / AI_CAMPAIGN.sizeTurnsPerStep);
}

export interface LandRequest {
  readonly kind: 'attack' | 'defend';
  readonly x: number;
  readonly y: number;
  readonly priority: number;
  readonly land: number;
}

/** Does the power have a colony, or a unit ashore, on this landmass? */
function presentOn(state: GameState, player: Player, land: number, coloniesOnly = false): boolean {
  if (coloniesOf(state, player.id).some((c) => landOf(state, c) === land)) return true;
  return !coloniesOnly && Object.values(state.units).some((u) => u.owner === player.id && isLand(u) && onMap(u) && u.aboard === null && landOf(state, u) === land);
}

/** The power's troops standing in a colony, in the order they are counted as its garrison: artillery, then soldiers, then dragoons. */
function troopsIn(state: GameState, colony: Colony): Unit[] {
  const rank = (u: Unit): number => (u.type === 'artillery' || u.type === 'damagedArtillery' ? 0 : u.type === 'dragoon' ? 2 : 1);
  return Object.values(state.units)
    .filter((u) => u.owner === colony.owner && isTroop(u) && onMap(u) && u.aboard === null && u.x === colony.x && u.y === colony.y)
    .sort((a, b) => rank(a) - rank(b) || byId(a, b));
}

/** What threatens a colony (worked out once per state). */
export function colonyThreat(state: GameState, colony: Colony): { readonly total: number; readonly adjacent: boolean } {
  return memo(state, `threat:${colony.id}`, () => threatTo(state, colony));
}

/** Defenders a colony wants (worked out once per state). */
export function defendersWanted(state: GameState, colony: Colony): number {
  return memo(state, `defenders:${colony.id}`, () => defendersFor(state, colony));
}

/** Of the troops in a colony, those it keeps as garrison: as many as it wants, taken in order. */
function garrisonOf(state: GameState, colony: Colony): Unit[] {
  return troopsIn(state, colony).slice(0, defendersWanted(state, colony));
}

/** The troops standing in the power's colonies that are their garrisons, and answer no other call. */
export function garrisons(state: GameState, player: Player): Set<string> {
  return memo(state, `garrisons:${player.id}`, () => new Set(coloniesOf(state, player.id).flatMap((c) => garrisonOf(state, c).map((u) => u.id))));
}

/** How many more troops a colony is short of. */
export function defendersShort(state: GameState, colony: Colony): number {
  return Math.max(0, defendersWanted(state, colony) - troopsIn(state, colony).length);
}

/** What the power wants done on land this turn, the most pressing first. */
export function landRequests(state: GameState, player: Player): LandRequest[] {
  const out: LandRequest[] = [];
  // any foreign colony on a landmass where it has a foothold, three turns in four, if it is big enough
  Object.values(state.colonies).forEach((c, index) => {
    if (c.owner === player.id || !isPower(state, c.owner) || spared(state, c.owner)) return;
    if ((index + state.turn) % AI_CAMPAIGN.restEvery === 0 || !worthTaking(state, c)) return;
    if (state.players.find((p) => p.id === c.owner)?.kind === 'human' && unseenYet(state, player, c, AI_CAMPAIGN.unseenHumanUntil)) return;
    const land = landOf(state, c);
    if (!presentOn(state, player, land)) return;
    out.push({ kind: 'attack', x: c.x, y: c.y, land, priority: firmPeace(state, player, c.owner) ? AI_CAMPAIGN.colonyPriorityAtPeace : AI_CAMPAIGN.colonyPriority });
  });
  // settlements of a people that has turned on it
  for (const s of Object.values(state.settlements)) {
    if (!atWarWithTribe(state, player, s.tribe)) continue;
    const land = landOf(state, s);
    if (!presentOn(state, player, land)) continue;
    out.push({ kind: 'attack', x: s.x, y: s.y, land, priority: s.mission ? AI_CAMPAIGN.settlementPriority : AI_CAMPAIGN.settlementPriorityNoMission });
  }
  // its own colonies that are short of defenders
  for (const c of coloniesOf(state, player.id)) {
    const short = defendersShort(state, c);
    if (short > 0) out.push({ kind: 'defend', x: c.x, y: c.y, land: landOf(state, c), priority: short + AI_CAMPAIGN.defendBase });
  }
  return out.map((r, i) => ({ r, i })).sort((a, b) => b.r.priority - a.r.priority || a.i - b.i).map((e) => e.r);
}

/** The request each free troop answers: the lowest load x distance / (priority + 1) on its own landmass, within what the priority is worth. */
export function landOrders(state: GameState, player: Player): Record<string, LandRequest> {
  return memo(state, `landOrders:${player.id}`, () => workOutLandOrders(state, player));
}

function workOutLandOrders(state: GameState, player: Player): Record<string, LandRequest> {
  const requests = landRequests(state, player);
  const base = baseLoad(state, player);
  const loads = requests.map(() => base);
  const garrison = garrisons(state, player);
  const troops = Object.values(state.units).filter((u) => u.owner === player.id && isTroop(u) && onMap(u) && u.aboard === null).sort(byId);
  const orders: Record<string, LandRequest> = {};
  // those already marching to a colony's defence count there first
  for (const u of troops) {
    if (u.orders !== 'goto' || !u.destination) continue;
    const i = requests.findIndex((r) => r.kind === 'defend' && r.x === u.destination?.[0] && r.y === u.destination[1]);
    if (i >= 0) loads[i] = (loads[i] as number) + 1;
  }
  for (const u of troops) {
    if (garrison.has(u.id) || u.orders === 'goto') continue;
    const land = landOf(state, u);
    if (u.type === 'soldier' || u.type === 'dragoon') {
      // one or two men alone do not go campaigning
      const company = Object.values(state.units).filter((o) => o.owner === player.id && isLand(o) && onMap(o) && o.aboard === null && landOf(state, o) === land).length;
      if (company < AI_CAMPAIGN.companyLeast || (company === AI_CAMPAIGN.companyLeast && !presentOn(state, player, land, true))) continue;
    }
    let best = -1;
    let least = 9999;
    requests.forEach((r, i) => {
      if (r.land !== land) return;
      const score = Math.trunc(((loads[i] as number) * far(r.x, r.y, u.x, u.y)) / (r.priority + 1));
      if (score < least && (3 * r.priority) >> 1 >= Math.trunc(score / base)) {
        least = score;
        best = i;
      }
    });
    if (best < 0) continue;
    const request = requests[best] as LandRequest;
    orders[u.id] = request;
    // a call to attack is never filled: everyone in reach goes
    if (request.kind === 'defend') loads[best] = (loads[best] as number) + 1;
  }
  return orders;
}

// --- invasions -------------------------------------------------------------------------------------

export interface InvadeRequest {
  readonly x: number;
  readonly y: number;
  readonly priority: number;
  readonly colonyId: string;
  readonly land: number;
  /** A landing to settle, not to fight: beside a small rival colony, or a native settlement, on land where the power has no colony. */
  readonly settle?: true;
  /** The colony or settlement the landing is made beside. */
  readonly beside?: readonly [number, number];
}

const openSea = (state: GameState, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return false;
  const tile = state.map.tiles[y * state.map.width + x];
  // (the outermost squares of the map cannot be sailed)
  return tile !== undefined && isWater(tile) && !isBorder(state.map, x, y) && !isInlandLake(state.map, x, y);
};
const unitsAt = (state: GameState, x: number, y: number): Unit[] => Object.values(state.units).filter((u) => onMap(u) && u.x === x && u.y === y);
/** A square troops can be put ashore on: land of that landmass with nobody and nothing on it. */
const freeLanding = (state: GameState, x: number, y: number, land: number): boolean =>
  landmassAt(state.map, x, y) === land && !colonyAt(state, x, y) && !settlementAt(state, x, y) && unitsAt(state, x, y).length === 0;

/**
 * The beach for a landing near a colony: an open-sea square within three squares of it that
 * touches its landmass, the farther off and the more land beside it the better (the later
 * square on a tie). None if somebody else is on that square or there is nowhere free to step ashore.
 */
export function invasionBeach(state: GameState, colony: { readonly x: number; readonly y: number }, by: PlayerId | null = null): readonly [number, number] | null {
  const land = landOf(state, colony);
  const r = AI_CAMPAIGN.beachReach;
  let best: readonly [number, number] | null = null;
  let top = -1;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const x = colony.x + dx;
      const y = colony.y + dy;
      if (!openSea(state, x, y)) continue;
      const beside = DIRS.filter(([ex, ey]) => landmassAt(state.map, x + ex, y + ey) === land).length;
      if (beside < 1) continue;
      const score = 2 * (Math.abs(dx) + Math.abs(dy) + beside);
      if (score >= top) {
        top = score;
        best = [x, y];
      }
    }
  }
  // (the power's own ship lying there is the landing under way, not an obstacle)
  if (!best || unitsAt(state, best[0], best[1]).some((u) => u.owner !== by)) return null;
  return DIRS.some(([ex, ey]) => freeLanding(state, (best as readonly [number, number])[0] + ex, (best as readonly [number, number])[1] + ey, land)) ? best : null;
}

/** Colonies a power has on a landmass, and its people there: those in its colonies and its colonist-type units. */
function strengthOn(state: GameState, owner: PlayerId, land: number): { colonies: number; people: number } {
  const colonies = coloniesOf(state, owner).filter((c) => landOf(state, c) === land);
  const afoot = Object.values(state.units).filter((u) => u.owner === owner && UNIT_TYPES[u.type].colonistRole && onMap(u) && u.aboard === null && landOf(state, u) === land).length;
  return { colonies: colonies.length, people: colonies.reduce((n, c) => n + c.colonists.length, 0) + afoot };
}

/** Why no landing is planned beside this colony, or null if one is. */
export function invasionRefusal(state: GameState, player: Player, colony: Colony): 'own' | 'spared' | 'firmPeace' | 'notOutnumbered' | 'tooFew' | 'tooSmall' | 'noBeach' | null {
  if (colony.owner === player.id || !isPower(state, colony.owner)) return 'own';
  if (spared(state, colony.owner)) return 'spared';
  if (firmPeace(state, player, colony.owner) || unseenYet(state, player, colony, AI_CAMPAIGN.unseenUntil)) return 'firmPeace';
  const land = landOf(state, colony);
  const theirs = strengthOn(state, colony.owner, land);
  if (theirs.colonies <= strengthOn(state, player.id, land).colonies) return 'notOutnumbered';
  if (theirs.people < AI_CAMPAIGN.invadeColonistsFrom) return 'tooFew';
  if (!worthTaking(state, colony)) return 'tooSmall';
  return invasionBeach(state, colony, player.id) ? null : 'noBeach';
}

/** The landings the power would make this turn, the most pressing first. */
export function invadeRequests(state: GameState, player: Player): InvadeRequest[] {
  return memo(state, `invade:${player.id}`, () => workOutInvasions(state, player));
}

function workOutInvasions(state: GameState, player: Player): InvadeRequest[] {
  const out: InvadeRequest[] = [];
  const taken = new Set<number>();
  const weigh = (c: Colony, land: number, base: number): number => {
    let priority = base;
    const there = Object.values(state.colonies).filter((o) => isPower(state, o.owner) && landOf(state, o) === land);
    if (state.players.find((p) => p.id === c.owner)?.kind === 'human') {
      priority += AI_CAMPAIGN.invadeHumanBonus;
      // more still where the human has a landmass of some size all to himself
      if (there.every((o) => o.owner === c.owner)) priority += AI_CAMPAIGN.invadeAloneFrom.filter((size) => landmassSize(state, land) >= size).length;
    }
    if (AI_CAMPAIGN.crowdedPer * there.length > landmassSize(state, land)) priority -= AI_CAMPAIGN.crowdedPenalty;
    if (player.stance[c.owner] === 'war') priority += AI_CAMPAIGN.invadeWarBonus;
    return state.turn < AI_CAMPAIGN.doubledBefore ? priority * 2 : priority;
  };
  for (const c of Object.values(state.colonies)) {
    const land = landOf(state, c);
    const refusal = invasionRefusal(state, player, c);
    if (refusal === null) {
      const beach = invasionBeach(state, c, player.id) as readonly [number, number];
      taken.add(land);
      out.push({ x: beach[0], y: beach[1], priority: weigh(c, land, AI_CAMPAIGN.invadePriority), colonyId: c.id, land, beside: [c.x, c.y] });
      continue;
    }
    // where it has no colony and the rival has few people there, it lands settlers beside him instead
    if (refusal !== 'notOutnumbered' && refusal !== 'tooFew') continue;
    if (strengthOn(state, player.id, land).colonies !== 0 || strengthOn(state, c.owner, land).people >= AI_CAMPAIGN.invadeColonistsFrom || !worthTaking(state, c)) continue;
    const beach = invasionBeach(state, c, player.id);
    if (!beach) continue;
    taken.add(land);
    out.push({ x: beach[0], y: beach[1], priority: weigh(c, land, AI_CAMPAIGN.settlePriority), colonyId: c.id, land, settle: true, beside: [c.x, c.y] });
  }
  // and beside a native settlement on land where it has no colony, and no landing is planned already
  for (const v of Object.values(state.settlements)) {
    const land = landOf(state, v);
    if (taken.has(land) || strengthOn(state, player.id, land).colonies !== 0) continue;
    const beach = invasionBeach(state, v, player.id);
    if (beach) out.push({ x: beach[0], y: beach[1], priority: AI_CAMPAIGN.settlePriority, colonyId: '', land, settle: true, beside: [v.x, v.y] });
  }
  return out.map((r, i) => ({ r, i })).sort((a, b) => b.r.priority - a.r.priority || a.i - b.i).map((e) => e.r);
}

/** A ship is full when every hold is taken, passengers counting as cargo does. `boarding` are people about to come aboard. */
export function isFull(state: GameState, ship: Unit, boarding = 0): boolean {
  return holdsUsed(state, ship) + boarding >= UNIT_TYPES[ship.type].holds;
}

/** The landing a full ship at (x, y) takes, as a warship takes its station: any, with troops aboard; with pioneers only, one made to settle. */
export function invasionFor(state: GameState, player: Player, x: number, y: number, troops = true): InvadeRequest | null {
  const base = baseLoad(state, player);
  let best: InvadeRequest | null = null;
  let least = 9999;
  for (const r of invadeRequests(state, player)) {
    if (!troops && !r.settle) continue;
    const score = Math.trunc((base * far(r.x, r.y, x, y)) / (r.priority + 1));
    if (score < least && (3 * r.priority) >> 1 >= Math.trunc(score / base)) {
      least = score;
      best = r;
    }
  }
  return best;
}

/** Where someone aboard a ship lying off a landing beach steps ashore: the free square of that landmass nearest what the landing is made beside. Troops at any landing; settlers at one made to settle. */
export function landingStep(state: GameState, rider: Unit, ship: Unit, player: Player): Action | null {
  if (rider.movesLeft <= 0) return null;
  const request = invadeRequests(state, player).find((r) => r.x === ship.x && r.y === ship.y && (isTroop(rider) || (r.settle === true && UNIT_TYPES[rider.type].colonistRole && rider.type !== 'missionary')));
  if (!request?.beside) return null;
  const [tx, ty] = request.beside;
  const steps = DIRS.filter(([dx, dy]) => freeLanding(state, ship.x + dx, ship.y + dy, request.land))
    .sort((a, b) => far(ship.x + a[0], ship.y + a[1], tx, ty) - far(ship.x + b[0], ship.y + b[1], tx, ty));
  for (const [dx, dy] of steps) {
    const ashore: Action = { type: 'moveUnit', unitId: rider.id, dx, dy };
    if (ok(state, ashore)) return ashore;
  }
  return null;
}

// --- quiet regions ---------------------------------------------------------------------------------

/** Who on this landmass the power is at odds with: rival powers not at firm peace with it, and native peoples that have turned on it. */
function enemiesOn(state: GameState, player: Player, land: number): string[] {
  const rivals = new Set<PlayerId>();
  for (const c of Object.values(state.colonies)) if (c.owner !== player.id && isPower(state, c.owner) && landOf(state, c) === land) rivals.add(c.owner);
  for (const u of Object.values(state.units)) if (u.owner !== player.id && isPower(state, u.owner) && isLand(u) && onMap(u) && u.aboard === null && landOf(state, u) === land) rivals.add(u.owner);
  const out: string[] = [...rivals].filter((o) => !firmPeace(state, player, o));
  for (const s of Object.values(state.settlements)) {
    if (landOf(state, s) === land && atWarWithTribe(state, player, s.tribe) && !out.includes(tribeOwner(s.tribe))) out.push(tribeOwner(s.tribe));
  }
  return out;
}

/** Summed attack values of an owner's land units on a landmass. */
const strengthOf = (state: GameState, owner: string, land: number): number =>
  Object.values(state.units).reduce((n, u) => n + (u.owner === owner && isLand(u) && onMap(u) && u.aboard === null && landOf(state, u) === land ? UNIT_TYPES[u.type].attack : 0), 0);

/**
 * How a landmass stands for the power: 0 well settled and quiet, 6 room to grow, 4 to be
 * taken (somebody it is at odds with is there and it is the stronger or has no colony, or it
 * has nothing there at all), 3 to be defended (such an enemy is at least as strong and it has a colony).
 */
export function regionState(state: GameState, player: Player, land: number): 0 | 3 | 4 | 6 {
  return memo(state, `region:${player.id}:${land}`, () => {
    if (!presentOn(state, player, land)) return 4;
    const all = Object.values(state.colonies).filter((c) => isPower(state, c.owner) && landOf(state, c) === land);
    const mine = all.filter((c) => c.owner === player.id).length;
    const foes = enemiesOn(state, player, land);
    if (foes.length > 0) {
      const ours = strengthOf(state, player.id, land);
      const theirs = Math.max(...foes.map((o) => strengthOf(state, o, land)));
      return ours > theirs || mine === 0 ? 4 : 3;
    }
    return AI_CAMPAIGN.quietTimes * (mine + all.length) > landmassSize(state, land) ? 0 : 6;
  });
}

/**
 * Is this landmass quiet for the power: well settled, and nobody on it that it is at odds with?
 * Troops with nothing to do in a quiet region are free to be shipped elsewhere.
 */
export function isQuiet(state: GameState, player: Player, land: number): boolean {
  const all = Object.values(state.colonies).filter((c) => isPower(state, c.owner) && landOf(state, c) === land);
  const mine = all.filter((c) => c.owner === player.id).length;
  return AI_CAMPAIGN.quietTimes * (mine + all.length) > landmassSize(state, land) && enemiesOn(state, player, land).length === 0;
}

// --- fighting on land ------------------------------------------------------------------------------

/** The odds as the planner reckons them: 8 x attack / (defence + 1), threefold against a colony and twofold against a settlement. */
export function scaledOdds(state: GameState, unit: Unit, dx: number, dy: number): number {
  const analysis = analyseAttack(state, unit, dx, dy);
  if (!analysis) return 0;
  const x = unit.x + dx;
  const y = unit.y + dy;
  const colony = colonyAt(state, x, y) !== null;
  const village = settlementAt(state, x, y) !== null;
  // guns are for walls
  if ((unit.type === 'artillery' || unit.type === 'damagedArtillery') && !colony && !village) return 0;
  let odds = Math.trunc((AI_CAMPAIGN.oddsScale * analysis.attacker.strength) / (analysis.defender.strength + 1));
  // weighed by what stands to be won and what is risked: the cost of the units there, a head, against the attacker's own
  const there = unitsAt(state, x, y).filter((u) => u.aboard === null);
  const prize = there.reduce((n, u) => n + UNIT_TYPES[u.type].cost, 0);
  odds = Math.trunc((odds * Math.trunc((prize + 1) / Math.max(1, there.length))) / Math.max(1, UNIT_TYPES[unit.type].cost));
  odds *= colony ? AI_CAMPAIGN.colonyTimes : village ? AI_CAMPAIGN.settlementTimes : 1;
  // an attacking arm is keener still on land that is to be taken
  const owner = state.players.find((p) => p.id === unit.owner);
  if (owner && UNIT_TYPES[unit.type].aiRoles.includes('attack') && regionState(state, owner, landOf(state, unit)) === 4) odds *= AI_CAMPAIGN.contestedTimes;
  return Math.min(odds, AI_CAMPAIGN.oddsMost);
}

/** Summed attack values of the land units on a square (a ship in port or offshore takes no part in an assault). */
const attackAt = (state: GameState, x: number, y: number, owner: PlayerId | null): number =>
  unitsAt(state, x, y).reduce((n, u) => n + (isLand(u) && u.aboard === null && (owner === null || u.owner === owner) ? UNIT_TYPES[u.type].attack : 0), 0);

/** Soldiers and dragoons storm a colony only when the attackers massed around it out-total its garrison. */
export function assaultReady(state: GameState, player: Player, colony: { readonly x: number; readonly y: number }): boolean {
  const garrison = attackAt(state, colony.x, colony.y, null);
  if (garrison === 0) return true;
  const massed = DIRS.reduce((n, [dx, dy]) => n + attackAt(state, colony.x + dx, colony.y + dy, player.id), 0);
  return garrison < massed;
}

/** May the unit fall on what stands on that square at all? Europeans only at war, natives only when hostile and near one of our colonies. */
export function mayAttack(state: GameState, player: Player, x: number, y: number): boolean {
  const village = settlementAt(state, x, y);
  const colony = colonyAt(state, x, y);
  const foe = unitsAt(state, x, y).find((u) => u.owner !== player.id);
  const tribe = village?.tribe ?? (foe ? tribeOfOwner(foe.owner) : null);
  if (tribe) return atWarWithTribe(state, player, tribe) && presentOn(state, player, landmassAt(state.map, x, y), true);
  const owner = colony?.owner ?? foe?.owner;
  if (owner === undefined || owner === player.id || spared(state, owner)) return false;
  return player.stance[owner] === 'war';
}

/** The attack a troop makes from where it stands: the best odds among its neighbours, if they reach twelve. */
export function landAttackChoice(state: GameState, unit: Unit, player: Player): Action | null {
  if (!isTroop(unit) || unit.aboard !== null || unit.movesLeft < AI_CAMPAIGN.attackMovesLeast) return null;
  let best: Action | null = null;
  let top = AI_CAMPAIGN.oddsLeast - 1;
  for (const [dx, dy] of DIRS) {
    const x = unit.x + dx;
    const y = unit.y + dy;
    const attack: Action = { type: 'attack', unitId: unit.id, dx, dy };
    if (!mayAttack(state, player, x, y) || !ok(state, attack)) continue;
    const colony = colonyAt(state, x, y);
    if (colony && (unit.type === 'soldier' || unit.type === 'dragoon') && !assaultReady(state, player, colony)) continue;
    const odds = scaledOdds(state, unit, dx, dy);
    if (odds > top) {
      top = odds;
      best = attack;
    }
  }
  return best;
}

export { peopleAt };
