// The Explore order (R-1066; docs/RULES.md "Exploring"). A scout or a ship given it moves on its
// own, each turn, toward the cheapest place from which its sight shows squares its owner has not
// seen. A scout turns aside for rumours and for chiefs nobody has spoken with. It plans over the
// squares its owner has explored only, and wakes when nothing reachable is left.
import { attitude, isHostile, tribalAlarm } from './alarm';
import { EXPLORE } from './data/explore';
import { MOVEMENT } from './data/movement';
import { SIGHT } from './data/sight';
import { NATIVES } from './data/tribes';
import { sightRadius } from './explore';
import { executeMove, isBorder, isInlandLake, isShipUnit, landStepCost, planMove, sailWatched, type MoveEvent, type SailWatch } from './movement';
import type { NavalEvent } from './naval';
import { costsFrom, pathIn, type StepCost } from './path';
import { canExplore, exploreRumor, type RumorEvent } from './rumors';
import { tribeOfOwner } from './settlements';
import { hasFather, MOVE_THIRDS, playerIndexOf, tileAt, type GameState, type Player, type Settlement, type Unit, type UnitId } from './state';
import { isExploredBy, isWater, type Tile } from './tile';
import { checkVillageAction, contactAt, speakWithChief, type VillageEvent } from './village';

export type ExploreErrorCode = 'cannotExplore' | 'carried' | 'atSea' | 'noMovesLeft' | 'underRepair';
export type ExploreCheck = { readonly ok: true } | { readonly ok: false; readonly code: ExploreErrorCode; readonly message: string };

/** Nothing reachable is left to explore: the unit has woken where it stands. */
export type ExploreEvent = { readonly type: 'exploreDone'; readonly unitId: UnitId; readonly x: number; readonly y: number };

export type ExploreStepEvent = MoveEvent | NavalEvent | RumorEvent | VillageEvent | ExploreEvent;

const no = (code: ExploreErrorCode, message: string): ExploreCheck => ({ ok: false, code, message });

/** A scout on land (not aboard), or any ship. */
export function mayExplore(unit: Unit): boolean {
  return isShipUnit(unit) || unit.type === 'scout';
}

/** May this unit be given the Explore order now? (Ownership is the caller's to check.) */
export function checkExplore(unit: Unit): ExploreCheck {
  if (!mayExplore(unit)) return no('cannotExplore', 'only a scout or a ship can explore');
  if (unit.voyage) return no('atSea', `unit ${unit.id} is away on a voyage`);
  if (unit.aboard !== null) return no('carried', 'a carried unit goes where its ship goes');
  if (unit.repair > 0) return no('underRepair', `the ship needs ${unit.repair} more turns of repair`);
  if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
  return { ok: true };
}

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);

/** Is the owner of `other` at war with this power: another power by stance, the Crown in the War of Independence, or an angry tribe? */
function enemyOf(state: GameState, player: Player, other: string): boolean {
  if (other === player.id) return false;
  const tribe = tribeOfOwner(other);
  if (tribe) return tribalAlarm(state, tribe, player.id) >= (NATIVES.alarmLevels[2] as number);
  if (other === state.crownPlayer) return player.atWar;
  return player.stance[other] === 'war';
}

/** At the start of its turn an exploring unit wakes if an enemy stands within one square of it. */
export function enemyNear(state: GameState, unit: Unit): boolean {
  const player = playerOf(state, unit.owner);
  if (!player) return false;
  return Object.values(state.units).some((o) => o.voyage === null && o.owner !== unit.owner
    && Math.max(Math.abs(o.x - unit.x), Math.abs(o.y - unit.y)) <= 1 && enemyOf(state, player, o.owner));
}

/** A settlement whose chief an exploring scout of this power will go to: nobody has spoken with him, and his people are not Angry nor at War with it. */
export function chiefWelcomes(state: GameState, owner: string, settlement: Settlement): boolean {
  return settlement.scouted.length === 0 && attitude(state, settlement.tribe, owner) < EXPLORE.chiefAttitudeBelow && !isHostile(settlement, owner);
}

/** A welcoming chief this scout has not already spoken with under its present order. */
const chiefFor = (state: GameState, unit: Unit, settlement: Settlement): boolean =>
  !(unit.heard ?? []).includes(settlement.id) && chiefWelcomes(state, unit.owner, settlement);

/** While a burial question waits, the power's exploring scouts keep off rumours (one question at a time). */
const burialWaits = (state: GameState, unit: Unit): boolean => playerOf(state, unit.owner)?.pendingBurial != null;

const scoutOnLand = (state: GameState, unit: Unit): boolean => unit.type === 'scout' && canExplore(state, unit);

/** The settlement beside the scout whose chief it would speak with now, if any (the lowest id first). */
function chiefBeside(state: GameState, unit: Unit): Settlement | null {
  const near = Object.values(state.settlements)
    .filter((s) => Math.max(Math.abs(s.x - unit.x), Math.abs(s.y - unit.y)) === 1 && chiefFor(state, unit, s))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return near.find((s) => checkVillageAction(state, unit, s.id, 'speakWithChief').ok) ?? null;
}

interface Target {
  readonly x: number;
  readonly y: number;
  readonly cost: number;
  /** Unexplored squares its sight would show from there. */
  readonly shows: number;
  readonly steps: readonly (readonly [number, number])[];
}

/** Cheaper first, then the one showing more, then north before south, then west before east. */
function better(a: Omit<Target, 'steps'>, b: Omit<Target, 'steps'> | null): boolean {
  if (b === null) return true;
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.shows !== b.shows) return a.shows > b.shows;
  return a.y !== b.y ? a.y < b.y : a.x < b.x;
}

/** The step costs an exploring unit plans with: explored squares only, never into another power's square. */
function exploreStep(state: GameState, unit: Unit): StepCost {
  const { map } = state;
  const index = playerIndexOf(state, unit.owner);
  const blocked = new Set<number>();
  for (const o of Object.values(state.units)) if (o.owner !== unit.owner && o.voyage === null && o.x >= 0) blocked.add(o.y * map.width + o.x);
  for (const c of Object.values(state.colonies)) if (c.owner !== unit.owner) blocked.add(c.y * map.width + c.x);
  for (const s of Object.values(state.settlements)) blocked.add(s.y * map.width + s.x);
  const ship = isShipUnit(unit);
  return (fx, fy, tx, ty) => {
    if (isBorder(map, tx, ty)) return null;
    const tile = tileAt(map, tx, ty) as Tile;
    if (!isExploredBy(tile, index) || blocked.has(ty * map.width + tx)) return null;
    if (ship) return isWater(tile) && !isInlandLake(map, tx, ty) ? MOVEMENT.shipCost : null;
    return isWater(tile) ? null : landStepCost(state, fx, fy, tx, ty);
  };
}

/** How many squares within `radius` of (x, y) the player has not explored. */
function unexploredAround(state: GameState, index: number, x: number, y: number, radius: number): number {
  const { map } = state;
  let n = 0;
  for (let ty = Math.max(0, y - radius); ty <= Math.min(map.height - 1, y + radius); ty++) {
    for (let tx = Math.max(0, x - radius); tx <= Math.min(map.width - 1, x + radius); tx++) {
      if (!isExploredBy(map.tiles[ty * map.width + tx] as Tile, index)) n++;
    }
  }
  return n;
}

/** Where the unit goes next, or null when nothing reachable is left to explore. */
export function exploreTarget(state: GameState, unit: Unit, heedBurial = true): Target | null {
  const { map } = state;
  const index = playerIndexOf(state, unit.owner);
  const reach = costsFrom(map, unit.x, unit.y, exploreStep(state, unit));
  const radius = sightRadius(unit.type, hasFather(state, unit.owner, SIGHT.deSoto));
  const scout = scoutOnLand(state, unit);
  // squares beside a chief the scout would go to
  const besideChief = new Set<number>();
  if (scout) {
    for (const s of Object.values(state.settlements)) {
      if (!isExploredBy(map.tiles[s.y * map.width + s.x] as Tile, index) || !chiefFor(state, unit, s)) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) besideChief.add((s.y + dy) * map.width + s.x + dx);
    }
  }
  const rumours = scout && !(heedBurial && burialWaits(state, unit));
  let plain: Omit<Target, 'steps'> | null = null;
  let special: Omit<Target, 'steps'> | null = null;
  for (let i = 0; i < reach.cost.length; i++) {
    const cost = reach.cost[i] as number;
    if (i === reach.start || cost === Infinity) continue;
    const x = i % map.width;
    const y = (i - x) / map.width;
    const shows = unexploredAround(state, index, x, y, radius);
    const here = { x, y, cost, shows };
    if (shows > 0 && better(here, plain)) plain = here;
    if (scout && ((rumours && (map.tiles[i] as Tile).rumor) || besideChief.has(i)) && better(here, special)) special = here;
  }
  const pick = special && (!plain || special.cost <= plain.cost + EXPLORE.preferWithin * MOVE_THIRDS) ? special : plain;
  if (!pick) return null;
  const path = pathIn(reach, pick.x, pick.y);
  return path ? { ...pick, steps: path.steps } : null;
}

function withUnit(state: GameState, unit: Unit): GameState {
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

/**
 * Move an exploring unit as far as its moves allow this turn. A scout speaks with a welcoming chief
 * beside it (which spends its moves) and stops for the turn on any rumour it enters; with nothing
 * left in reach the order is cleared and `exploreDone` is said.
 */
export function advanceExplore(state: GameState, unitId: UnitId, watch: SailWatch): { state: GameState; events: ExploreStepEvent[] } {
  const events: ExploreStepEvent[] = [];
  let next = state;
  let route: { readonly steps: readonly (readonly [number, number])[]; at: number } | null = null;
  for (let guard = 0; guard < EXPLORE.maxSteps; guard++) {
    const unit = next.units[unitId];
    if (!unit || unit.orders !== 'explore' || unit.voyage || unit.movesLeft <= 0) break;
    if (scoutOnLand(next, unit)) {
      const chief = chiefBeside(next, unit);
      if (chief) {
        // the tribe meets the scout before its chief hears him
        const heard: VillageEvent[] = [];
        next = contactAt(next, unit.owner, unit.x, unit.y, heard);
        next = speakWithChief(next, next.units[unitId] as Unit, chief, heard);
        events.push(...heard);
        // it does not go back to the same chief, whatever he said
        const after = next.units[unitId];
        if (after) next = withUnit(next, { ...after, heard: [...(after.heard ?? []), chief.id] });
        break;
      }
    }
    if (!route || route.at >= route.steps.length) {
      const target = exploreTarget(next, unit);
      if (!target) {
        // a rumour still in reach waits for the burial question to be answered; the order stands
        if (scoutOnLand(next, unit) && burialWaits(next, unit) && exploreTarget(next, unit, false)) break;
        next = withUnit(next, { ...unit, orders: 'none' });
        events.push({ type: 'exploreDone', unitId, x: unit.x, y: unit.y });
        break;
      }
      route = { steps: target.steps, at: 0 };
    }
    const [sx, sy] = route.steps[route.at] as readonly [number, number];
    // a rumour in the way waits until the burial question already found has been answered
    if (scoutOnLand(next, unit) && tileAt(next.map, sx, sy)?.rumor && burialWaits(next, unit)) break;
    const check = planMove(next, unit, sx - unit.x, sy - unit.y, { sail: false, landfall: false });
    // something stands in the way now: try again next turn
    if (!check.ok || (check.plan.kind !== 'land' && check.plan.kind !== 'sail')) break;
    const outcome = executeMove(next, unitId, check.plan);
    next = outcome.state;
    events.push(...outcome.events);
    if (!outcome.moved) break;
    if (check.plan.kind === 'sail') next = sailWatched(next, unitId, watch, events);
    route.at++;
    // new squares seen: think again
    if (outcome.events.some((e) => e.type === 'tilesExplored')) route = null;
    const moved = next.units[unitId];
    if (!moved) break;
    if (scoutOnLand(next, moved) && tileAt(next.map, moved.x, moved.y)?.rumor) {
      const found: RumorEvent[] = [];
      next = exploreRumor(next, unitId, found);
      events.push(...found);
      const after = next.units[unitId];
      if (after) next = withUnit(next, { ...after, movesLeft: 0 });
      break;
    }
  }
  return { state: next, events };
}

/** At the start of the owner's turn: wake beside an enemy, or explore on. */
export function exploreTurn(state: GameState, unitId: UnitId, watch: SailWatch): { state: GameState; events: ExploreStepEvent[] } {
  const unit = state.units[unitId];
  if (!unit || unit.orders !== 'explore') return { state, events: [] };
  if (enemyNear(state, unit)) return { state: withUnit(state, { ...unit, orders: 'none' }), events: [] };
  return advanceExplore(state, unitId, watch);
}
