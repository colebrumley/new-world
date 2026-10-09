// Battles between land units (R-600): one European unit attacks another in the open; and what
// becomes of any beaten land unit, whoever beat it. Strengths and the throw are in combat.ts;
// attacks on natives and by natives are in native-war.ts; colonies and ships come with R-601/R-602.
import { addGoods, equipmentOf } from './cargo';
import { combatOdds, earnsPromotion, pickDefender, promotedProfession, rollCombat, type CombatOdds, type Fighter } from './combat';
import { CAPTURED_WHEN_BEATEN, COMBAT, CONTINENTAL, DEMOTION, DESTROYED_WHEN_BEATEN } from './data/combat';
import { GOOD_IDS } from './data/goods';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { createRng, type Rng } from './rng';
import { settlementAt } from './settlements';
import { colonyAt, type GameState, type Goods, type Player, type PlayerId, type Unit } from './state';

export type UnitFate = 'destroyed' | 'captured' | 'demoted' | 'damaged';

export type BattleEvent =
  /** A fight was decided. Strengths are in eighths of a point. */
  | { readonly type: 'battle'; readonly attackerId: string; readonly defenderId: string | null; readonly x: number; readonly y: number; readonly attack: number; readonly defense: number; readonly attackerWon: boolean }
  /** A unit was beaten. `lost` is whatever goods went with it or were stripped from it; a captured unit now belongs to `captor`. */
  | { readonly type: 'unitLost'; readonly unitId: string; readonly owner: string; readonly fate: UnitFate; readonly became: UnitTypeId | null; readonly lost: Goods; readonly captor?: string }
  | { readonly type: 'unitPromoted'; readonly unitId: string; readonly profession: string; readonly became?: UnitTypeId }
  /** Two powers are now at war because one attacked the other. */
  | { readonly type: 'warBegan'; readonly by: PlayerId; readonly on: PlayerId };

/** Anything battle events can be pushed onto. */
export interface BattleSink {
  push(...events: BattleEvent[]): unknown;
}

export type BattleErrorCode = 'noTarget' | 'cannotAttack' | 'noMovesLeft' | 'landFirst' | 'colonyAttack';
export type BattleCheck = { readonly ok: true } | { readonly ok: false; readonly code: BattleErrorCode; readonly message: string };
const no = (code: BattleErrorCode, message: string): BattleCheck => ({ ok: false, code, message });

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const putUnit = (state: GameState, unit: Unit): GameState => ({ ...state, units: { ...state.units, [unit.id]: unit } });
const dropUnit = (state: GameState, id: string): GameState => {
  const { [id]: _gone, ...units } = state.units;
  return { ...state, units };
};
const sumGoods = (a: Goods, b: Goods): Goods => {
  let total = a;
  for (const g of GOOD_IDS) if ((b[g] ?? 0) > 0) total = addGoods(total, g, b[g] ?? 0);
  return total;
};
const lessGoods = (a: Goods, b: Goods): Goods => {
  let rest: Goods = {};
  for (const g of GOOD_IDS) if ((a[g] ?? 0) - (b[g] ?? 0) > 0) rest = addGoods(rest, g, (a[g] ?? 0) - (b[g] ?? 0));
  return rest;
};

/**
 * What becomes of a land unit that has lost a fight. Fighting units are stripped a step
 * (dragoon to soldier to colonist; artillery damaged, then destroyed); scouts, pioneers and
 * missionaries are destroyed; colonists, wagon trains and treasure are taken by a European
 * victor that can fight, and destroyed by anyone else.
 */
export function unitBeaten(state: GameState, unit: Unit, victor: Fighter, events: BattleSink): GameState {
  const captor = playerOf(state, victor.owner);
  if (CAPTURED_WHEN_BEATEN.includes(unit.type) && captor && UNIT_TYPES[victor.type].attack > 0) {
    // a veteran taken prisoner gives up soldiering
    const profession = unit.profession === 'veteranSoldier' ? 'freeColonist' : unit.profession;
    events.push({ type: 'unitLost', unitId: unit.id, owner: unit.owner, fate: 'captured', became: null, lost: {}, captor: captor.id });
    return putUnit(state, { ...unit, owner: captor.id, profession, orders: 'none', destination: null, route: null, movesLeft: 0 });
  }
  const became = (DEMOTION as Partial<Record<UnitTypeId, UnitTypeId>>)[unit.type];
  if (!became || DESTROYED_WHEN_BEATEN.includes(unit.type) || CAPTURED_WHEN_BEATEN.includes(unit.type)) {
    events.push({ type: 'unitLost', unitId: unit.id, owner: unit.owner, fate: 'destroyed', became: null, lost: sumGoods(equipmentOf(unit), unit.cargo) });
    return dropUnit(state, unit.id);
  }
  // a missionary pressed into the ranks goes back to his calling
  const next: UnitTypeId = unit.type === 'soldier' && unit.profession === 'jesuitMissionary' ? 'missionary' : became;
  const after: Unit = { ...unit, type: next, orders: 'none', tools: 0 };
  events.push({ type: 'unitLost', unitId: unit.id, owner: unit.owner, fate: unit.type === 'artillery' ? 'damaged' : 'demoted', became: next, lost: lessGoods(equipmentOf(unit), equipmentOf(after)) });
  return putUnit(state, after);
}

/** The winner of a fight may be raised a rank; a veteran of a rebel power may join the Continental line. */
export function promoteWinner(state: GameState, unit: Unit, odds: Pick<CombatOdds, 'attack' | 'defense'>, won: 'attack' | 'defense', rng: Rng, events: BattleSink): GameState {
  const mine = won === 'attack' ? odds.attack : odds.defense;
  const theirs = won === 'attack' ? odds.defense : odds.attack;
  const now = state.units[unit.id];
  if (!now || !earnsPromotion(state, now, mine, theirs, rng)) return state;
  const owner = playerOf(state, now.owner);
  if (now.profession === 'veteranSoldier') {
    const line = (CONTINENTAL as Partial<Record<UnitTypeId, UnitTypeId>>)[now.type];
    if (!line || !owner?.atWar || owner.kind !== 'human') return state;
    events.push({ type: 'unitPromoted', unitId: now.id, profession: 'veteranSoldier', became: line });
    return putUnit(state, { ...now, type: line });
  }
  const profession = promotedProfession(now.profession);
  if (profession === now.profession || profession === null) return state;
  events.push({ type: 'unitPromoted', unitId: now.id, profession });
  return putUnit(state, { ...now, profession });
}

/** May this unit attack the European unit on the square (dx, dy) away? Colonies are another matter. */
export function checkAttackUnit(state: GameState, unit: Unit, dx: number, dy: number): BattleCheck {
  const type = UNIT_TYPES[unit.type];
  if (type.domain !== 'land' || type.attack <= 0) return no('cannotAttack', 'this unit cannot attack');
  if (unit.aboard !== null) return no('landFirst', 'the unit must go ashore before it can attack');
  if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return no('noTarget', 'attacks are made on a neighbouring square');
  const x = unit.x + dx;
  const y = unit.y + dy;
  if (colonyAt(state, x, y)) return no('colonyAttack', 'a colony is attacked in another way');
  if (settlementAt(state, x, y)) return no('noTarget', 'that is a native settlement');
  const there = Object.values(state.units).some((u) => u.x === x && u.y === y && u.owner !== unit.owner && playerOf(state, u.owner) && u.aboard === null && u.voyage === null && UNIT_TYPES[u.type].domain === 'land');
  return there ? { ok: true } : no('noTarget', 'there is no enemy there to attack');
}

/** The odds a unit would face attacking the square (dx, dy) away, for showing beforehand. */
export function previewAttack(state: GameState, unit: Unit, dx: number, dy: number): { odds: CombatOdds; defender: Unit } | null {
  const defender = pickDefender(state, unit.x + dx, unit.y + dy, unit);
  return defender ? { odds: combatOdds(state, unit, defender), defender } : null;
}

/** Attacking another power is war with it, whatever was agreed before. */
export function goToWar(state: GameState, by: PlayerId, on: PlayerId, events: BattleSink): GameState {
  const attacker = playerOf(state, by);
  const victim = playerOf(state, on);
  if (!attacker || !victim || (attacker.stance[on] === 'war' && victim.stance[by] === 'war')) return state;
  events.push({ type: 'warBegan', by, on });
  // breaking a treaty by force leaves the victim with a grudge
  const broke = attacker.stance[on] === 'peace';
  const blank = { grudge: false, piracy: false, intent: false, truce: 0, lastTalk: -1, kingsWarUntil: 0 };
  return {
    ...state,
    players: state.players.map((p) => (p.id === by ? { ...p, stance: { ...p.stance, [on]: 'war' as const } }
      : p.id === on ? { ...p, stance: { ...p.stance, [by]: 'war' as const }, dealings: broke ? { ...p.dealings, [by]: { ...(p.dealings[by] ?? blank), grudge: true } } : p.dealings }
      : p)),
  };
}

/** One land unit attacks the best defender on a neighbouring square in the open. */
export function attackUnit(state: GameState, unit: Unit, dx: number, dy: number, events: BattleEvent[]): GameState {
  const x = unit.x + dx;
  const y = unit.y + dy;
  const defender = pickDefender(state, x, y, unit) as Unit;
  const rng = createRng(state.rng);
  let next = goToWar(state, unit.owner, defender.owner, events);
  const odds = combatOdds(next, unit, defender, true);
  const won = rollCombat(next, unit, defender, odds, rng);
  events.push({ type: 'battle', attackerId: unit.id, defenderId: defender.id, x, y, attack: odds.attack, defense: odds.defense, attackerWon: won });
  next = putUnit(next, { ...unit, movesLeft: Math.max(0, unit.movesLeft - COMBAT.fullMove) });
  if (won) {
    next = unitBeaten(next, defender, unit, events);
    next = promoteWinner(next, unit, odds, 'attack', rng, events);
  } else {
    next = unitBeaten(next, next.units[unit.id] as Unit, defender, events);
    next = promoteWinner(next, defender, odds, 'defense', rng, events);
  }
  return { ...next, rng: rng.state() };
}
