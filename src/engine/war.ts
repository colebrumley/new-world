// The War of Independence once it is under way (R-901): how the Crown's troops ashore march and
// fight, help from abroad, soldiers for hire, and how the war is won or lost. The Declaration
// itself, the landings and the Tory risings are in independence.ts. Rules in docs/RULES.md
// "War of Independence".
import { attackColony, checkAttackColony, type AssaultEvent } from './assault';
import { attackUnit, checkAttackUnit, previewAttack, type BattleEvent } from './battle';
import { coloniesOf } from './colony';
import { isPortColony } from './construction';
import { INDEPENDENCE as I } from './data/independence';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { colonyBells, updateLiberty } from './liberty';
import { fullMoves, isInlandLake, landStepCost } from './movement';
import { createRng, type Rng } from './rng';
import type { RoyalEvent } from './royal';
import { settlementAt } from './settlements';
import { colonyAt, tileAt, unitsAt, type Colony, type GameOverReason, type GameState, type Player, type PlayerId, type Revolution, type RoyalOffer, type Unit } from './state';
import { isLand, isWater } from './tile';

export type WarEvent =
  /** A shipload of the friend's troops has come in. */
  | { readonly type: 'interventionArrived'; readonly player: PlayerId; readonly colonyId: string; readonly shipId: string; readonly unitIds: readonly string[] }
  /** The rebels have beaten the King's troops for the first time: they learn what victory will take. */
  | { readonly type: 'refBeaten'; readonly player: PlayerId }
  /** The war is going badly: few ports left, few colonies, or the King holds most of the people. */
  | { readonly type: 'warWarning'; readonly player: PlayerId; readonly danger: 'ports' | 'colonies' | 'population'; readonly value: number };

/** Anything the war's events can be pushed onto. */
export interface WarSink {
  push(...events: (WarEvent | AssaultEvent | BattleEvent | RoyalEvent)[]): unknown;
}

const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;
const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const level = (state: GameState): number => DIFFICULTIES.indexOf(state.difficulty);
const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const isLandUnit = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'land' && u.voyage === null && u.aboard === null;
const REGULARS: readonly UnitTypeId[] = ['regular', 'cavalry', 'artillery', 'damagedArtillery'];

/** Note that the rebels have won a fight against the King's troops, the first time it happens. */
export function noteRefBeaten(state: GameState, rebelId: PlayerId, events: WarSink): GameState {
  const war = playerOf(state, rebelId)?.revolution;
  if (!war || war.refBeaten) return state;
  events.push({ type: 'refBeaten', player: rebelId });
  return patch(state, rebelId, { revolution: { ...war, refBeaten: true } });
}

// --- the Crown's troops ashore -----------------------------------------------------------------

function canEnter(state: GameState, crown: PlayerId, x: number, y: number): boolean {
  const tile = tileAt(state.map, x, y);
  if (!tile || x <= 0 || y <= 0 || x >= state.map.width - 1 || y >= state.map.height - 1 || !isLand(tile)) return false;
  const colony = colonyAt(state, x, y);
  if (colony && colony.owner !== crown) return false;
  if (settlementAt(state, x, y)) return false;
  return !unitsAt(state, x, y).some((u) => u.owner !== crown);
}

/** One unit's move: storm a rebel colony alongside, fall on a weaker unit in the open, or close on the nearest colony. */
function marchUnit(state: GameState, unitId: string, rebelId: PlayerId, crown: PlayerId, events: WarSink): GameState {
  let next = state;
  for (let guard = 0; guard < 8; guard++) {
    const unit = next.units[unitId];
    if (!unit || unit.owner !== crown || unit.movesLeft <= 0) break;
    // somebody has to hold what has been taken
    const here = colonyAt(next, unit.x, unit.y);
    if (here && !unitsAt(next, unit.x, unit.y).some((u) => u.id !== unit.id && u.owner === crown && UNIT_TYPES[u.type].attack > 1 && u.orders !== 'none')) {
      next = { ...next, units: { ...next.units, [unit.id]: { ...unit, orders: 'fortified', movesLeft: 0 } } };
      break;
    }
    const town = DIRS.find(([dx, dy]) => colonyAt(next, unit.x + dx, unit.y + dy)?.owner === rebelId && checkAttackColony(next, unit, dx, dy).ok);
    if (town) {
      const fought: AssaultEvent[] = [];
      next = attackColony(next, unit, town[0], town[1], fought);
      events.push(...fought);
      if (fought.some((e) => e.type === 'battle' && !e.attackerWon)) next = noteRefBeaten(next, rebelId, events);
      continue;
    }
    const prey = DIRS.find(([dx, dy]) => {
      if (colonyAt(next, unit.x + dx, unit.y + dy) || !checkAttackUnit(next, unit, dx, dy).ok) return false;
      const seen = previewAttack(next, unit, dx, dy);
      return seen !== null && seen.defender.owner === rebelId && seen.odds.attack * 100 >= (seen.odds.attack + seen.odds.defense) * I.crownAttackOdds;
    });
    if (prey) {
      const fought: BattleEvent[] = [];
      next = attackUnit(next, unit, prey[0], prey[1], fought);
      events.push(...fought);
      if (fought.some((e) => e.type === 'battle' && !e.attackerWon)) next = noteRefBeaten(next, rebelId, events);
      continue;
    }
    // nothing to fight: close on the nearest rebel colony
    const goal = coloniesOf(next, rebelId).reduce<Colony | null>((best, c) => (!best || far(unit.x, unit.y, c.x, c.y) < far(unit.x, unit.y, best.x, best.y) ? c : best), null);
    if (!goal) break;
    const now = far(unit.x, unit.y, goal.x, goal.y);
    if (now <= 1) break; // at the gate with no way to attack this turn
    // the straightest open step; they do not wander
    const step = DIRS.filter(([dx, dy]) => canEnter(next, crown, unit.x + dx, unit.y + dy) && far(unit.x + dx, unit.y + dy, goal.x, goal.y) < now)
      .sort((a, b) => Math.hypot(unit.x + a[0] - goal.x, unit.y + a[1] - goal.y) - Math.hypot(unit.x + b[0] - goal.x, unit.y + b[1] - goal.y))[0];
    if (!step) break;
    const cost = Math.max(1, landStepCost(next, unit.x, unit.y, unit.x + step[0], unit.y + step[1]));
    next = { ...next, units: { ...next.units, [unit.id]: { ...unit, x: unit.x + step[0], y: unit.y + step[1], orders: 'none', movesLeft: Math.max(0, unit.movesLeft - cost) } } };
  }
  return next;
}

/**
 * The Crown's troops already ashore take their turn, before any new wave lands: each marches on
 * the nearest rebel colony and attacks it. In the colonies the King holds, the bells that would
 * have rung for liberty ring against it.
 */
export function crownMoves(state: GameState, rebelId: PlayerId, events: WarSink): GameState {
  const crown = state.crownPlayer;
  if (crown === null || !playerOf(state, rebelId)?.revolution || state.over) return state;
  const units: Record<string, Unit> = {};
  for (const u of Object.values(state.units)) units[u.id] = u.owner === crown && u.orders !== 'fortified' ? { ...u, movesLeft: fullMoves(u) } : u;
  let next: GameState = { ...state, units };
  for (const u of Object.values(units)) {
    if (u.owner === crown && isLandUnit(u) && UNIT_TYPES[u.type].attack > 0) next = marchUnit(next, u.id, rebelId, crown, events);
  }
  const colonies = { ...next.colonies };
  for (const colony of Object.values(next.colonies)) {
    if (colony.owner !== crown) continue;
    colonies[colony.id] = updateLiberty(next, colony, -Math.floor(colonyBells(next, colony, 0) / 2), []);
  }
  return { ...next, colonies };
}

// --- help from abroad --------------------------------------------------------------------------

/** A port of the rebels', by lot weighted by population, and the best water beside it for a friendly ship. */
function friendlyBerth(state: GameState, playerId: PlayerId, rng: Rng): { colony: Colony; x: number; y: number } | null {
  const ports = coloniesOf(state, playerId).filter((c) => isPortColony(state, c)).slice(0, I.portsWeighed);
  const total = ports.reduce((n, c) => n + c.colonists.length, 0);
  if (total === 0) return null;
  let roll = rng.int(0, total - 1);
  const colony = ports.find((c) => (roll -= c.colonists.length) < 0) ?? (ports[0] as Colony);
  let best: { x: number; y: number; land: number } | null = null;
  for (const [dx, dy] of DIRS) {
    const x = colony.x + dx;
    const y = colony.y + dy;
    const tile = tileAt(state.map, x, y);
    if (!tile || !isWater(tile) || isInlandLake(state.map, x, y) || unitsAt(state, x, y).some((u) => u.owner !== playerId)) continue;
    const land = DIRS.filter(([ex, ey]) => {
      const t = tileAt(state.map, x + ex, y + ey);
      return t !== null && isLand(t) && unitsAt(state, x + ex, y + ey).length === 0;
    }).length;
    if (!best || land > best.land) best = { x, y, land };
  }
  return best ? { colony, x: best.x, y: best.y } : null;
}

function raise(state: GameState, owner: PlayerId, type: UnitTypeId, profession: Unit['profession'], x: number, y: number): { state: GameState; id: string } {
  const id = `u${state.nextId}`;
  const base: Unit = {
    id, owner, type, profession, x, y, aboard: null, orders: 'none', destination: null, movesLeft: 0,
    cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
  };
  return { state: { ...state, nextId: state.nextId + 1, units: { ...state.units, [id]: { ...base, movesLeft: fullMoves(base) } } }, id };
}

/**
 * Once a foreign power has come in, one of its ships arrives each rebel turn while any remain:
 * a Man-of-War for the rebels to command, and up to six trained units put straight into a port.
 */
export function interventionArrives(state: GameState, playerId: PlayerId, events: WarSink): GameState {
  const war = playerOf(state, playerId)?.revolution;
  if (!war || !war.intervened || war.force.ships <= 0) return state;
  const rng = createRng(state.rng);
  const berth = friendlyBerth(state, playerId, rng);
  if (!berth) return { ...state, rng: rng.state() };
  const ship = raise({ ...state, rng: rng.state() }, playerId, 'manOWar', null, berth.x, berth.y);
  let next = ship.state;
  const cavalry = Math.min(war.force.cavalry, I.aidSupport);
  const artillery = Math.min(war.force.artillery, I.aidSupport);
  const infantry = Math.min(war.force.infantry, I.aidPerShip - cavalry - artillery);
  const ids: string[] = [];
  const land = (type: UnitTypeId, profession: Unit['profession'], count: number): void => {
    for (let i = 0; i < count; i++) {
      const put = raise(next, playerId, type, profession, berth.colony.x, berth.colony.y);
      next = put.state;
      ids.push(put.id);
    }
  };
  land('continentalCavalry', 'veteranSoldier', cavalry);
  land('artillery', null, artillery);
  land('continentalArmy', 'veteranSoldier', infantry);
  const force: Revolution['force'] = { infantry: war.force.infantry - infantry, cavalry: war.force.cavalry - cavalry, artillery: war.force.artillery - artillery, ships: war.force.ships - 1 };
  events.push({ type: 'interventionArrived', player: playerId, colonyId: berth.colony.id, shipId: ship.id, unitIds: ids });
  return patch(next, playerId, { revolution: { ...war, force } });
}

/** In wartime the larger of the powers that stood aside may hire out trained troops, if the rebels can pay. */
export function wartimeHire(state: GameState, playerId: PlayerId, events: WarSink): GameState {
  const player = playerOf(state, playerId);
  const war = player?.revolution;
  if (!player || !war || player.kind !== 'human' || player.pendingOffer || war.patron === null || coloniesOf(state, playerId).length === 0) return state;
  if (war.intervened && war.force.ships > 0) return state; // the friend's own ships are still coming in
  const rng = createRng(state.rng);
  const after = (): GameState => ({ ...state, rng: rng.state() });
  if (rng.int(0, I.hireOdds - 1) !== 0) return after();
  const d = level(state);
  const army = rng.int(I.hireLeast, I.hireLeast + ((I.force.spare - d) >> 1));
  const horse = rng.int(0, 1) === 0;
  const price = 100 * (2 * (d + I.hireLevelOffset) + rng.int(0, I.hireSpread)) * (army + I.hireSupportWeight);
  if (player.gold < price) return after();
  const from = (playerOf(state, war.patron) as Player).nation;
  const offer: RoyalOffer = { kind: 'continentals', from, army, cavalry: horse ? 1 : 0, artillery: horse ? 0 : 1, price };
  events.push({ type: 'royalOffer', player: playerId, offer });
  return patch(after(), playerId, { pendingOffer: offer });
}

// --- how it ends -------------------------------------------------------------------------------

/** The share of the people in colonies that the King holds, per cent. */
export function kingsShare(state: GameState, rebelId: PlayerId): number {
  const count = (owner: PlayerId | null): number => (owner === null ? 0 : coloniesOf(state, owner).reduce((n, c) => n + c.colonists.length, 0));
  const king = count(state.crownPlayer) + 1;
  return Math.floor((100 * king) / (king + count(rebelId) + 1));
}

/** Has the war been decided? Lost with no port, no colony, or the King holding nine parts in ten; won when his army is spent. */
export function warOutcome(state: GameState, rebelId: PlayerId): Extract<GameOverReason, 'independence' | 'crownVictory'> | null {
  const rebel = playerOf(state, rebelId);
  const crown = state.crownPlayer;
  if (!rebel?.revolution || crown === null) return null;
  const mine = coloniesOf(state, rebelId);
  if (mine.length === 0 || !mine.some((c) => isPortColony(state, c)) || kingsShare(state, rebelId) >= I.lostShare) return 'crownVictory';
  if (coloniesOf(state, crown).length > 0) return null;
  const ashore = Object.values(state.units).filter((u) => u.owner === crown && REGULARS.includes(u.type)).length;
  const reserve = rebel.ref.regulars + (rebel.ref.cavalry > 0 ? 1 : 0) + (rebel.ref.artillery > 0 ? 1 : 0);
  return ashore < (rebel.revolution.refBeaten ? I.fewAfterVictory : I.fewAshore) && reserve < I.fewInReserve ? 'independence' : null;
}

/** The warning due this turn, if the war is going badly: the last that applies of ports, the King's share, colonies. */
export function warWarning(state: GameState, rebelId: PlayerId): Extract<WarEvent, { type: 'warWarning' }> | null {
  if (!playerOf(state, rebelId)?.revolution) return null;
  const mine = coloniesOf(state, rebelId);
  const ports = mine.filter((c) => isPortColony(state, c)).length;
  const share = kingsShare(state, rebelId);
  if (mine.length < I.warnFewer) return { type: 'warWarning', player: rebelId, danger: 'colonies', value: mine.length };
  if (share >= I.warnShare) return { type: 'warWarning', player: rebelId, danger: 'population', value: share };
  if (ports < I.warnFewer) return { type: 'warWarning', player: rebelId, danger: 'ports', value: ports };
  return null;
}
