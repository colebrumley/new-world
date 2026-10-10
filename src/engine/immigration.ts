// The immigrant pool on the docks of Europe: who is in it, what a recruit costs, how a pool
// member becomes a unit (R-404), and how crosses bring them over unasked (R-405).

import { IMMIGRATION, SKILLED_IMMIGRANTS, SPAIN_FIRST_IMMIGRANT, STARTING_POOL, STARTING_POOL_PLAIN_FROM, UNSKILLED_IMMIGRANTS } from './data/immigration';
import type { NationId } from './data/nations';
import { PROFESSIONS, type ProfessionId } from './data/professions';
import { AI_RESERVE } from './data/ai';
import { PIONEER_TOOLS, UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES, type Difficulty } from './data/yields';
import { checkEuropeOpen, docksOf, newDockUnit, type EuropeCheck } from './europe';
import { createRng, type Rng } from './rng';
import { type GameState, type Player, type PlayerId, type UnitId } from './state';

export type ImmigrationEvent =
  /** Someone from the pool reached the docks. `price` is what was paid, or null if crosses brought them. */
  | { readonly type: 'immigrantArrived'; readonly player: PlayerId; readonly unitId: UnitId; readonly profession: ProfessionId; readonly unitType: UnitTypeId; readonly slot: number; readonly replacement: ProfessionId; readonly price: number | null }
  /** Crosses have brought someone, and this power may pick whom. */
  | { readonly type: 'immigrantChoice'; readonly player: PlayerId };

type Drawer = Pick<Player, 'kind' | 'fathers'>;
const level = (difficulty: Difficulty): number => DIFFICULTIES.indexOf(difficulty);
const isSkilled = (p: ProfessionId): boolean => !(UNSKILLED_IMMIGRANTS as readonly ProfessionId[]).includes(p);

/**
 * Draw one pool member. The unskilled rolls come first unless `forceSkilled`; the skilled draw
 * never repeats someone already in the pool, and gives a free colonist if the pool is all skilled.
 */
export function drawImmigrant(rng: Rng, drawer: Drawer, difficulty: Difficulty, pool: readonly ProfessionId[], forceSkilled: boolean): ProfessionId {
  const t = ((drawer.kind === 'human' ? level(difficulty) : IMMIGRATION.aiLevel) + 3) >> 1;
  const brewster = drawer.fathers.includes('williamBrewster');
  if (!forceSkilled) {
    if (rng.int(1, IMMIGRATION.criminalOdds) <= t) return brewster ? 'freeColonist' : 'pettyCriminal';
    if (rng.int(1, IMMIGRATION.servantOdds) <= t) return brewster ? 'freeColonist' : 'indenturedServant';
    if (rng.int(1, IMMIGRATION.freeColonistOdds) <= t) return 'freeColonist';
  }
  if (pool.length >= IMMIGRATION.poolSize && pool.every(isSkilled)) return 'freeColonist';
  const open = (Object.keys(SKILLED_IMMIGRANTS) as (keyof typeof SKILLED_IMMIGRANTS)[]).filter((p) => !pool.includes(p));
  let roll = rng.int(1, open.reduce((sum, p) => sum + SKILLED_IMMIGRANTS[p], 0));
  for (const p of open) {
    roll -= SKILLED_IMMIGRANTS[p];
    if (roll <= 0) return p;
  }
  return 'freeColonist';
}

/** The three who wait on the docks when the game begins. */
export function startingPool(rng: Rng, drawer: Drawer & { readonly nation: NationId }, difficulty: Difficulty): ProfessionId[] {
  const fixed = drawer.kind === 'human' ? STARTING_POOL[difficulty] : [level(difficulty) === DIFFICULTIES.length - 1 ? 'pettyCriminal' : 'indenturedServant', null, null] as const;
  const pool: ProfessionId[] = [];
  fixed.forEach((given, slot) => {
    pool.push(given ?? drawImmigrant(rng, drawer, difficulty, pool, slot === 2 || level(difficulty) < STARTING_POOL_PLAIN_FROM));
  });
  if (drawer.nation === 'spain') pool[0] = SPAIN_FIRST_IMMIGRANT;
  return pool;
}

/** The unit a newcomer of this calling steps ashore as. Veteran soldiers sometimes come mounted. */
export function immigrantUnit(rng: Rng, drawer: Drawer, difficulty: Difficulty, profession: ProfessionId): { type: UnitTypeId; tools: number } {
  const role = PROFESSIONS[profession].expertRole;
  if (role === null) return { type: 'colonist', tools: 0 };
  if (role === 'pioneer') return { type: 'pioneer', tools: PIONEER_TOOLS.max };
  if (role !== 'soldier') return { type: role, tools: 0 };
  const odds = IMMIGRATION.dragoonOdds + (drawer.kind === 'human' ? level(difficulty) : IMMIGRATION.aiLevel);
  return { type: rng.int(1, odds) === 1 ? 'dragoon' : 'soldier', tools: 0 };
}

/** Colonists in this power's colonies plus every unit it owns. */
export function headcount(state: GameState, playerId: PlayerId): number {
  const settled = Object.values(state.colonies).reduce((n, c) => n + (c.owner === playerId ? c.colonists.length : 0), 0);
  return settled + Object.values(state.units).filter((u) => u.owner === playerId).length;
}

/** Crosses that must be exceeded for the next immigrant to come of their own accord. */
export function crossesNeeded(state: GameState, playerId: PlayerId): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return IMMIGRATION.crossesCap;
  let needed = Math.min(IMMIGRATION.crossesCap, IMMIGRATION.crossesPerHead * headcount(state, playerId) + IMMIGRATION.crossesBase);
  if (player.kind === 'ai') needed = ((IMMIGRATION.aiEighths - level(state.difficulty)) * needed) >> 3;
  if (player.nation === 'england') needed = Math.trunc((needed * IMMIGRATION.englandFactor[0]) / IMMIGRATION.englandFactor[1]);
  return needed;
}

/** What it costs to hurry a pool member across now. Falls as crosses build, rises with every paid passage. */
export function recruitPrice(state: GameState, playerId: PlayerId): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  const n = Math.min(player.recruits, IMMIGRATION.paidRecruitsCap);
  if (player.kind === 'ai') {
    // a computer power's fare falls with the level instead of rising, and has no floor; with an
    // armed man already on its docks it is raising dragoons, at a fare by half the level and,
    // late in the game, a tenth off for each level
    const armed = docksOf(state, playerId).some((u) => UNIT_TYPES[u.type].attack > 1);
    const d = level(state.difficulty);
    const start = IMMIGRATION.priceStep * (n + IMMIGRATION.priceOffset - (armed ? d >> 1 : d));
    let fare = start - Math.trunc((start * player.crosses) / (crossesNeeded(state, playerId) + 1));
    if (armed && state.turn >= AI_RESERVE.discountFrom) fare -= Math.trunc((d * fare) / 10);
    return Math.max(0, fare);
  }
  const start = IMMIGRATION.priceStep * (n + level(state.difficulty) + IMMIGRATION.priceOffset);
  const floor = Math.max(IMMIGRATION.priceFloor, Math.trunc(start / IMMIGRATION.priceFloorDivisor));
  const price = start - Math.trunc(((start - floor) * player.crosses) / (crossesNeeded(state, playerId) + 1));
  return Math.max(IMMIGRATION.priceMinimum, price);
}

const no = (code: 'notForSale' | 'cannotAfford', message: string): EuropeCheck => ({ ok: false, code, message });

export function checkRecruit(state: GameState, playerId: PlayerId, slot: number): EuropeCheck {
  const open = checkEuropeOpen(state, playerId);
  if (!open.ok) return open;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !Number.isInteger(slot) || player.pool[slot] === undefined) return no('notForSale', 'nobody of that description is waiting');
  const price = recruitPrice(state, playerId);
  return player.gold >= price ? { ok: true } : no('cannotAfford', `passage costs ${price} gold`);
}

/**
 * Move the pool member in `slot` to the docks and draw a replacement. Crosses start again from
 * nothing unless `keepCrosses`; `price` (null for a free arrival) is taken from the treasury.
 */
export function bringImmigrant(state: GameState, playerId: PlayerId, slot: number, price: number | null, forceSkilled: boolean, events: ImmigrationEvent[], keepCrosses = false): GameState {
  const player = state.players.find((p) => p.id === playerId) as Player;
  const profession = player.pool[slot] as ProfessionId;
  const rng = createRng(state.rng);
  const kit = immigrantUnit(rng, player, state.difficulty, profession);
  const replacement = drawImmigrant(rng, player, state.difficulty, player.pool, forceSkilled);
  const unit = { ...newDockUnit(state, playerId, kit.type, profession), tools: kit.tools };
  events.push({ type: 'immigrantArrived', player: playerId, unitId: unit.id, profession, unitType: kit.type, slot, replacement, price });
  const after: Player = {
    ...player,
    pool: player.pool.map((p, i) => (i === slot ? replacement : p)),
    gold: player.gold - (price ?? 0),
    crosses: keepCrosses ? player.crosses : 0,
    recruits: player.recruits + (price === null ? 0 : 1),
    hadImmigrant: true,
    immigrantDue: false,
  };
  return { ...state, rng: rng.state(), nextId: state.nextId + 1, units: { ...state.units, [unit.id]: unit }, players: state.players.map((p) => (p.id === playerId ? after : p)) };
}

export function recruit(state: GameState, playerId: PlayerId, slot: number, events: ImmigrationEvent[]): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (player?.kind === 'ai') {
    // a computer power's crosses run on, and its fares do not rise with each one it pays
    const after = bringImmigrant(state, playerId, slot, recruitPrice(state, playerId), false, events, true);
    return { ...after, players: after.players.map((p) => (p.id === playerId ? { ...p, recruits: player.recruits } : p)) };
  }
  return bringImmigrant(state, playerId, slot, recruitPrice(state, playerId), false, events);
}

// --- crosses (R-405) ----------------------------------------------------------------------------

const hasBrewster = (player: Pick<Player, 'fathers'>): boolean => player.fathers.includes('williamBrewster');

/** Brewster joins the Congress: the criminals and servants already waiting give way to free colonists. */
export function brewsterPool(pool: readonly ProfessionId[]): ProfessionId[] {
  return pool.map((p) => (p === 'pettyCriminal' || p === 'indenturedServant' ? 'freeColonist' : p));
}

/**
 * One power's immigration for the turn. Empty docks draw people on, a crowd on the docks puts
 * them off; when the crosses pass what is needed someone comes over free. With Brewster a human
 * power is asked whom (`immigrantDue`); otherwise the lot falls on one of the three.
 */
export function immigrationTurn(state: GameState, playerId: PlayerId, events: ImmigrationEvent[]): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.atWar || player.pool.length === 0 || player.immigrantDue) return state;
  const waiting = docksOf(state, playerId).length;
  const drift = waiting === 0 ? IMMIGRATION.emptyDocksBonus : player.hadImmigrant ? -IMMIGRATION.waitingPenalty * waiting : 0;
  const crosses = Math.max(0, player.crosses + drift);
  const due = crosses > crossesNeeded(state, playerId);
  const choosing = due && hasBrewster(player) && player.kind === 'human';
  const next: GameState = { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, crosses, immigrantDue: choosing } : p)) };
  if (!due) return next;
  if (choosing) {
    events.push({ type: 'immigrantChoice', player: playerId });
    return next;
  }
  return arriveByLot(next, playerId, events);
}

/** Someone comes over free, chosen by lot. Every few turns the place left in the pool goes to a skilled hand. */
export function arriveByLot(state: GameState, playerId: PlayerId, events: ImmigrationEvent[]): GameState {
  const rng = createRng(state.rng);
  const slot = rng.int(0, IMMIGRATION.poolSize - 1);
  return bringImmigrant({ ...state, rng: rng.state() }, playerId, slot, null, state.turn % IMMIGRATION.skilledEvery === 0, events);
}

export function checkChooseImmigrant(state: GameState, playerId: PlayerId, slot: number): EuropeCheck {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.immigrantDue) return no('notForSale', 'nobody is due to come over');
  return Number.isInteger(slot) && player.pool[slot] !== undefined ? { ok: true } : no('notForSale', 'nobody of that description is waiting');
}

/** The power's own pick of the three, free of charge; the place is refilled with an ordinary draw. */
export function chooseImmigrant(state: GameState, playerId: PlayerId, slot: number, events: ImmigrationEvent[]): GameState {
  return bringImmigrant(state, playerId, slot, null, false, events);
}

