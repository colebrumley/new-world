// Lost City Rumors (R-509): what a party finds when it walks onto one.
import { adjustTribalAlarm, type AlarmEvent, type AlarmSink } from './alarm';
import { equipmentOf } from './cargo';
import { coloniesOf } from './colony';
import type { GoodId } from './data/goods';
import { FOUNTAIN_TERRAIN, RUMOR_ROLLS, RUMORS as R, type RumorOutcome } from './data/rumors';
import type { TribeId } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { bringImmigrant, type ImmigrationEvent } from './immigration';
import { createRng, type Rng } from './rng';
import { nativeDistance } from './settlements';
import type { GameState, Goods, Player, PlayerId, Settlement, Unit } from './state';
import { isWater } from './tile';

export type BurialFind = 'left' | 'empty' | 'trinkets' | 'treasure';
export type RumorEvent =
  | AlarmEvent
  | ImmigrationEvent
  /** What the party found. `gold` is coin in hand; a treasure is a new unit to be carried home. */
  | { readonly type: 'rumorExplored'; readonly unitId: string; readonly player: PlayerId; readonly x: number; readonly y: number; readonly outcome: RumorOutcome; readonly gold: number; readonly newUnitId: string | null; readonly lost: Goods }
  | { readonly type: 'burialSearched'; readonly unitId: string; readonly player: PlayerId; readonly find: BurialFind; readonly gold: number; readonly newUnitId: string | null; readonly sacredTo: TribeId | null };

export type RumorErrorCode = 'noBurial' | 'noFountain';
export type RumorCheck = { readonly ok: true } | { readonly ok: false; readonly code: RumorErrorCode; readonly message: string };

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });

/** How good an explorer the unit is: 0 anybody, 1 a scout, 2 a seasoned scout; De Soto raises scouts by one. */
export function explorerSkill(state: GameState, unit: Unit): { skill: number; soto: boolean } {
  if (unit.type !== 'scout') return { skill: 0, soto: false };
  const soto = playerOf(state, unit.owner)?.fathers.includes('hernandoDeSoto') ?? false;
  return { skill: (unit.profession === 'seasonedScout' ? 2 : 1) + (soto ? 1 : 0), soto };
}

function nearestSettlement(state: GameState, x: number, y: number): { settlement: Settlement; d: number } | null {
  let best: { settlement: Settlement; d: number } | null = null;
  for (const s of Object.values(state.settlements)) {
    const d = nativeDistance(s.x, s.y, x, y);
    if (!best || d < best.d) best = { settlement: s, d };
  }
  return best;
}

function addUnit(state: GameState, owner: PlayerId, type: Unit['type'], x: number, y: number, extra: Partial<Unit>): { state: GameState; id: string } {
  const id = `u${state.nextId}`;
  const unit: Unit = {
    id, owner, type, profession: null, x, y, movesLeft: 0, orders: 'none', destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0,
    route: null, repair: 0, treasure: 0, voyage: null, ...extra,
  };
  return { state: { ...state, nextId: state.nextId + 1, units: { ...state.units, [id]: unit } }, id };
}

/** Decide what a rumor is, applying the conditions each kind of find needs. */
export function rollRumor(state: GameState, unit: Unit, rng: Rng): { outcome: RumorOutcome; q: number } {
  const { skill, soto } = explorerSkill(state, unit);
  const player = playerOf(state, unit.owner) as Player;
  const tile = state.map.tiles[unit.y * state.map.width + unit.x];
  const explored = state.rumors.explored;
  const mine = coloniesOf(state, player.id);
  const colonists = mine.reduce((n, c) => n + c.colonists.length, 0);
  let least = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const o = Math.max(least, rng.int(1, RUMOR_ROLLS.length));
    const q = rng.int(1, 100) + R.skillBonus * skill;
    let outcome: RumorOutcome = RUMOR_ROLLS[o - 1] as RumorOutcome;
    if (outcome === 'fountain') {
      const wet = tile !== undefined && (FOUNTAIN_TERRAIN as readonly string[]).includes(tile.base) && tile.relief === 'flat';
      if (player.atWar) outcome = 'cibola';
      else if (!soto && !(wet && explored >= R.fountainAfter)) outcome = q <= R.vanishUnder ? 'vanished' : 'nothing';
    }
    if (outcome === 'cibola') {
      const rough = tile !== undefined && (tile.relief !== 'flat' || tile.base === 'desert');
      const fits = (rough || (soto && rng.int(1, R.cibolaSotoOdds) === 1)) && explored >= R.cibolaAfter && state.rumors.cibolas < R.cibolaMost;
      if (!fits) outcome = q <= R.vanishUnder ? 'vanished' : q < R.shrinesUnder ? 'shrines' : 'nothing';
    }
    if (outcome === 'vanished') {
      let kept = rng.int(0, skill) === 0;
      if (colonists <= R.spareColonists && mine.length <= R.spareColonies) kept = false;
      if (kept && unit.type === 'pioneer' && colonists <= R.sparePioneerColonists && rng.int(0, 1) === 0) kept = false;
      if (!kept) outcome = 'nothing';
      else if (!player.rumorLossSpared) outcome = 'burial';
    }
    if (outcome === 'shrines') {
      const near = nearestSettlement(state, unit.x, unit.y);
      const known = near !== null && near.d <= R.shrineRange && (state.tribes[near.settlement.tribe]?.met.includes(player.id) ?? false);
      if (!known || rng.int(0, skill) !== 0) outcome = 'nothing';
    }
    const poor = outcome === 'nothing' || outcome === 'vanished' || outcome === 'shrines';
    if (!soto || !poor) return { outcome, q };
    // De Soto's scouts look again, but the great finds come only on the first look
    least = Math.min(3, least + 1);
  }
  return { outcome: 'nothing', q: 100 };
}

/** A land unit has stepped onto a rumor. The rumor is gone whatever comes of it. */
export function exploreRumor(state: GameState, unitId: string, events: RumorEvent[]): GameState {
  const unit = state.units[unitId];
  const player = unit ? playerOf(state, unit.owner) : undefined;
  if (!unit || !player) return state;
  const index = unit.y * state.map.width + unit.x;
  const tile = state.map.tiles[index];
  if (!tile?.rumor || isWater(tile)) return state;
  const rng = createRng(state.rng);
  const tiles = [...state.map.tiles];
  tiles[index] = { ...tile, rumor: false };
  let next: GameState = { ...state, map: { ...state.map, tiles }, rumors: { ...state.rumors, explored: state.rumors.explored + 1 } };
  const { skill } = explorerSkill(next, unit);
  const d = player.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : 0;
  const { outcome, q } = rollRumor(next, unit, rng);
  let gold = 0;
  let newUnitId: string | null = null;
  let lost: Goods = {};

  switch (outcome) {
    case 'fountain':
      next = patch(next, player.id, { fountain: player.fountain + R.fountainImmigrants });
      break;
    case 'cibola': {
      const made = addUnit(next, player.id, 'treasure', unit.x, unit.y, { treasure: (rng.int(1, R.cibolaDie) + R.cibolaPerSkill * (skill + 2)) * 100 });
      next = { ...made.state, rumors: { ...made.state.rumors, cibolas: made.state.rumors.cibolas + 1 } };
      newUnitId = made.id;
      break;
    }
    case 'ruins':
      gold = R.ruinsUnit * rng.int(1, R.ruinsDie);
      if (skill > 0) gold = Math.trunc((gold * (skill + 2)) / 2);
      break;
    case 'gift':
      gold = R.giftUnit * rng.int(1, R.giftDie);
      break;
    case 'burial':
      next = patch(next, player.id, { rumorLossSpared: true, pendingBurial: { unitId: unit.id, x: unit.x, y: unit.y, q, skill } });
      break;
    case 'vanished': {
      lost = equipmentOf(unit);
      for (const [good, amount] of Object.entries(unit.cargo)) lost = { ...lost, [good as GoodId]: (lost[good as GoodId] ?? 0) + (amount ?? 0) };
      const { [unit.id]: _gone, ...units } = next.units;
      next = { ...next, units };
      break;
    }
    case 'shrines': {
      const near = nearestSettlement(next, unit.x, unit.y);
      if (near) next = adjustTribalAlarm(next, near.settlement.tribe, player.id, rng.int(1, R.shrineDie) + R.shrinePerLevel * Math.max(0, d - skill + 1), rng, events as AlarmSink);
      break;
    }
    case 'survivors': {
      const made = addUnit(next, player.id, 'colonist', unit.x, unit.y, { profession: 'freeColonist' });
      next = made.state;
      newUnitId = made.id;
      break;
    }
    default:
  }
  if (gold > 0) next = patch(next, player.id, { gold: (playerOf(next, player.id) as Player).gold + gold });
  events.push({ type: 'rumorExplored', unitId: unit.id, player: player.id, x: unit.x, y: unit.y, outcome, gold, newUnitId, lost });
  next = { ...next, rng: rng.state() };
  // a computer power does not stop to think
  if (player.kind === 'ai') {
    if (outcome === 'burial') next = answerBurial(next, player.id, true, events);
    if (outcome === 'fountain') next = drinkFountain(next, player.id, events);
  }
  return next;
}

export function checkAnswerBurial(state: GameState, playerId: PlayerId): RumorCheck {
  return playerOf(state, playerId)?.pendingBurial ? { ok: true } : { ok: false, code: 'noBurial', message: 'there are no burial mounds to decide about' };
}

/** Dig into the mounds, or leave them be. They may be sacred to the tribe nearby, which will not forgive it. */
export function answerBurial(state: GameState, playerId: PlayerId, search: boolean, events: RumorEvent[]): GameState {
  const player = playerOf(state, playerId) as Player;
  const mound = player.pendingBurial as NonNullable<Player['pendingBurial']>;
  let next = patch(state, playerId, { pendingBurial: null });
  if (!search) {
    events.push({ type: 'burialSearched', unitId: mound.unitId, player: playerId, find: 'left', gold: 0, newUnitId: null, sacredTo: null });
    return next;
  }
  const rng = createRng(next.rng);
  const near = nearestSettlement(next, mound.x, mound.y);
  const known = near !== null && (next.tribes[near.settlement.tribe]?.met.includes(playerId) ?? false);
  const sacred = known && near !== null && rng.int(1, (near.d + R.sacredBase) << mound.skill) <= R.sacredAtMost;
  let find: BurialFind = 'treasure';
  if (mound.q < R.burialEmptyUnder) find = 'empty';
  else if (mound.q < (sacred ? R.burialTrinketsUnder : R.burialTrinketsUnderPlain)) find = 'trinkets';
  let gold = 0;
  let newUnitId: string | null = null;
  if (find === 'trinkets') {
    gold = R.ruinsUnit * rng.int(1, R.ruinsDie);
    next = patch(next, playerId, { gold: (playerOf(next, playerId) as Player).gold + gold });
  } else if (find === 'treasure') {
    const made = addUnit(next, playerId, 'treasure', mound.x, mound.y, { treasure: 2 * (rng.int(1, R.burialDie) + 2 * (mound.skill + R.burialSkillBase)) * 100 });
    next = made.state;
    newUnitId = made.id;
  }
  const sacredTo = sacred && near ? near.settlement.tribe : null;
  events.push({ type: 'burialSearched', unitId: mound.unitId, player: playerId, find, gold, newUnitId, sacredTo });
  if (sacredTo) next = adjustTribalAlarm(next, sacredTo, playerId, R.sacredAlarm, rng, events as AlarmSink);
  return { ...next, rng: rng.state() };
}

export function checkFountainPick(state: GameState, playerId: PlayerId, slot: number): RumorCheck {
  const player = playerOf(state, playerId);
  return player && player.fountain > 0 && Number.isInteger(slot) && player.pool[slot] !== undefined ? { ok: true } : { ok: false, code: 'noFountain', message: 'nobody is waiting to follow the tale of the Fountain' };
}

/** One of those drawn by the tale of the Fountain comes over: free, and without touching the crosses. */
export function fountainPick(state: GameState, playerId: PlayerId, slot: number, events: RumorEvent[]): GameState {
  const player = playerOf(state, playerId) as Player;
  const next = bringImmigrant(state, playerId, slot, null, false, events as ImmigrationEvent[], true);
  return patch(next, playerId, { fountain: player.fountain - 1 });
}

/** Everyone still owed by the Fountain comes over, each drawn by lot. */
export function drinkFountain(state: GameState, playerId: PlayerId, events: RumorEvent[]): GameState {
  let next = state;
  for (let guard = 0; guard < 64 && ((playerOf(next, playerId)?.fountain ?? 0) > 0); guard++) {
    const rng = createRng(next.rng);
    const slot = rng.int(0, Math.max(0, (playerOf(next, playerId) as Player).pool.length - 1));
    next = fountainPick({ ...next, rng: rng.state() }, playerId, slot, events);
  }
  return next;
}

/** Is this a unit that explores rumors when it walks onto one? Land units of the colonial powers. */
export function canExplore(state: GameState, unit: Unit): boolean {
  return unit.voyage === null && unit.aboard === null && UNIT_TYPES[unit.type].domain === 'land' && playerOf(state, unit.owner) !== undefined;
}
