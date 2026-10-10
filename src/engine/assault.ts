// Colonies under attack (R-601): assaulting another power's colony, its capture, the state of
// siege, and a scout slipping in to look around.
import { goToWar, promoteWinner, unitBeaten, type BattleEvent } from './battle';
import { addGoods, amountOf } from './cargo';
import { coloniesOf } from './colony';
import { combatOdds, fortLevel, pickDefender, rollCombat, type Fighter } from './combat';
import { COMBAT } from './data/combat';
import { NAVAL } from './data/naval';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { createRng } from './rng';
import { settlementAt } from './settlements';
import { shipsLeavePort, type ShipEvent } from './ships';
import { colonyAt, type Colony, type GameState, type Player, type PlayerId, type Unit } from './state';

export type AssaultEvent =
  | BattleEvent
  | ShipEvent
  /** A colony has fallen to another power. `plunder` is the gold taken from the loser's treasury. */
  | { readonly type: 'colonyCaptured'; readonly colonyId: string; readonly name: string; readonly from: PlayerId; readonly to: PlayerId; readonly plunder: number; readonly unitId: string }
  /** A colony with nobody under arms handed its stored muskets to a colonist (Revere). */
  | { readonly type: 'musketsIssued'; readonly colonyId: string; readonly amount: number }
  /** A scout tried to slip into a foreign colony. Caught, it is lost and its horses stay; otherwise it has seen the colony. */
  | { readonly type: 'colonyInfiltrated'; readonly colonyId: string; readonly unitId: string; readonly player: PlayerId; readonly caught: boolean };

export type AssaultErrorCode = 'noTarget' | 'cannotAttack' | 'noMovesLeft' | 'landFirst' | 'noWarsDuringRevolution' | 'notAScout';
export type AssaultCheck = { readonly ok: true } | { readonly ok: false; readonly code: AssaultErrorCode; readonly message: string };
const no = (code: AssaultErrorCode, message: string): AssaultCheck => ({ ok: false, code, message });

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const putUnit = (state: GameState, unit: Unit): GameState => ({ ...state, units: { ...state.units, [unit.id]: unit } });
const isMilitary = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'land' && UNIT_TYPES[u.type].attack > 0 && u.type !== 'scout';

function foreignColony(state: GameState, unit: Unit, dx: number, dy: number): Colony | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return null;
  const colony = colonyAt(state, unit.x + dx, unit.y + dy);
  return colony && colony.owner !== unit.owner ? colony : null;
}

/** May this unit assault the colony on the square (dx, dy) away? */
export function checkAttackColony(state: GameState, unit: Unit, dx: number, dy: number): AssaultCheck {
  const type = UNIT_TYPES[unit.type];
  const colony = foreignColony(state, unit, dx, dy);
  if (!colony) return no('noTarget', 'there is no foreign colony there');
  if (type.domain !== 'land' || type.attack <= 0) return no('cannotAttack', 'this unit cannot attack');
  if (unit.aboard !== null) return no('landFirst', 'the unit must go ashore before it can attack');
  if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
  // a power fighting for its independence has no quarrel to spare for its neighbours
  if (playerOf(state, unit.owner)?.atWar && colony.owner !== state.crownPlayer) return no('noWarsDuringRevolution', 'we cannot make war on our neighbours while fighting for independence');
  return { ok: true };
}

/** The colony changes hands, with everyone and everything in it. */
function capture(state: GameState, colony: Colony, victor: Unit, events: AssaultEvent[]): GameState {
  const loser = playerOf(state, colony.owner) as Player;
  const captor = playerOf(state, victor.owner) as Player;
  // plunder: the loser's treasury in proportion to this colony's share of its people (not once independence is declared)
  const people = Math.max(1, coloniesOf(state, loser.id).reduce((n, c) => n + c.colonists.length, 0));
  const declared = state.players.some((p) => p.atWar);
  const plunder = declared ? 0 : Math.trunc((loser.gold * colony.colonists.length) / people);
  let next: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === loser.id ? { ...p, gold: p.gold - plunder } : p.id === captor.id ? { ...p, gold: p.gold + plunder } : p)),
  };
  // ships in port slip their cables, damaged; everyone else on the square is taken with the colony
  next = shipsLeavePort(next, colony, events);
  const units = { ...next.units };
  for (const u of Object.values(next.units)) {
    if (u.x === colony.x && u.y === colony.y && u.owner === loser.id && u.voyage === null) {
      units[u.id] = { ...u, owner: captor.id, orders: 'none', destination: null, route: null, movesLeft: 0, profession: u.profession === 'veteranSoldier' && u.type === 'colonist' ? 'freeColonist' : u.profession };
    }
  }
  units[victor.id] = { ...(next.units[victor.id] as Unit), x: colony.x, y: colony.y, movesLeft: 0 };
  const taken: Colony = {
    ...colony, owner: captor.id, exports: [],
    sol: { n: Math.trunc((colony.sol.n * NAVAL.capturedSol[0]) / NAVAL.capturedSol[1]), d: colony.sol.d },
    solLevel: 0, toryNoticed: false,
  };
  // the land around goes with it
  const tiles = next.map.tiles.map((t, i) => {
    const x = i % next.map.width;
    const y = Math.floor(i / next.map.width);
    const near = Math.max(Math.abs(x - colony.x), Math.abs(y - colony.y)) <= 1;
    if (!near || settlementAt(next, x, y)) return t;
    return t.claim === loser.id || (x === colony.x && y === colony.y) ? { ...t, claim: captor.id } : t;
  });
  const tradeRoutes = Object.fromEntries(Object.entries(next.tradeRoutes).filter(([, r]) => r.owner !== loser.id || !r.stops.some((s) => s.colonyId === colony.id)));
  events.push({ type: 'colonyCaptured', colonyId: colony.id, name: colony.name, from: loser.id, to: captor.id, plunder, unitId: victor.id });
  return { ...next, units, tradeRoutes, colonies: { ...next.colonies, [colony.id]: taken }, map: { ...next.map, tiles } };
}

/** A land unit assaults a foreign colony. If nobody under arms is there a colonist is drafted, and his defeat is the colony's fall. */
export function attackColony(state: GameState, unit: Unit, dx: number, dy: number, events: AssaultEvent[]): GameState {
  const colony = foreignColony(state, unit, dx, dy) as Colony;
  const owner = playerOf(state, colony.owner) as Player;
  const rng = createRng(state.rng);
  let next = goToWar(state, unit.owner, colony.owner, events);
  const real = pickDefender(next, colony.x, colony.y, unit);
  let drafted: Fighter | null = null;
  if (!real) {
    const revere = owner.fathers.includes('paulRevere') && amountOf(colony.goods, 'muskets') >= NAVAL.revereMuskets;
    if (revere) {
      next = { ...next, colonies: { ...next.colonies, [colony.id]: { ...colony, goods: addGoods(colony.goods, 'muskets', -NAVAL.revereMuskets) } } };
      events.push({ type: 'musketsIssued', colonyId: colony.id, amount: NAVAL.revereMuskets });
    }
    drafted = { type: revere ? 'soldier' : 'colonist', profession: 'freeColonist', owner: colony.owner, orders: 'none', x: colony.x, y: colony.y, movesLeft: 0 };
  }
  const defender = (real ?? drafted) as Fighter;
  const odds = combatOdds(next, unit, defender, true, drafted !== null);
  const won = rollCombat(next, unit, defender, odds, rng);
  events.push({ type: 'battle', attackerId: unit.id, defenderId: real?.id ?? null, x: colony.x, y: colony.y, attack: odds.attack, defense: odds.defense, attackerWon: won });
  next = putUnit(next, { ...unit, movesLeft: Math.max(0, unit.movesLeft - COMBAT.fullMove) });
  if (!won) {
    next = unitBeaten(next, next.units[unit.id] as Unit, defender, events);
    if (real) next = promoteWinner(next, real, odds, 'defense', rng, events);
    return { ...next, rng: rng.state() };
  }
  if (real) next = unitBeaten(next, real, unit, events);
  else next = capture(next, next.colonies[colony.id] as Colony, next.units[unit.id] as Unit, events);
  next = promoteWinner(next, next.units[unit.id] as Unit, odds, 'attack', rng, events);
  return { ...next, rng: rng.state() };
}

/**
 * A colony is besieged when the fighting land units of powers it is not at peace with, on its
 * square and the eight around it, outnumber its owner's. Scouts and ships do not count.
 */
export function isBesieged(state: GameState, colony: Colony): boolean {
  const owner = playerOf(state, colony.owner);
  let ours = 0;
  let theirs = 0;
  for (const u of Object.values(state.units)) {
    if (u.voyage !== null || u.aboard !== null || !isMilitary(u) || Math.max(Math.abs(u.x - colony.x), Math.abs(u.y - colony.y)) > 1) continue;
    if (u.owner === colony.owner) ours++;
    else if (playerOf(state, u.owner) && owner?.stance[u.owner] !== 'peace') theirs++;
  }
  return theirs > ours;
}

export function checkInfiltrate(state: GameState, unit: Unit, dx: number, dy: number): AssaultCheck {
  if (unit.type !== 'scout') return no('notAScout', 'only a scout can slip into a colony');
  if (!foreignColony(state, unit, dx, dy)) return no('noTarget', 'there is no foreign colony there');
  if (unit.aboard !== null) return no('landFirst', 'the scout must go ashore first');
  return unit.movesLeft > 0 ? { ok: true } : no('noMovesLeft', `unit ${unit.id} has no moves left`);
}

/** The chance, out of 36, that a scout entering this colony is caught. */
export function infiltrationRisk(state: GameState, unit: Unit, colony: Colony): number {
  let risk = 2 * (NAVAL.infiltrateBase + fortLevel(state, colony.x, colony.y));
  if (unit.profession === 'seasonedScout') risk >>= 1;
  if (playerOf(state, unit.owner)?.kind === 'human') risk += DIFFICULTIES.indexOf(state.difficulty) - 2;
  return Math.max(0, risk);
}

/** A scout tries to pass the gates unnoticed. Caught, he is lost and the colony keeps his horses. */
export function infiltrate(state: GameState, unit: Unit, dx: number, dy: number, events: AssaultEvent[]): GameState {
  const colony = foreignColony(state, unit, dx, dy) as Colony;
  const rng = createRng(state.rng);
  const caught = rng.int(1, NAVAL.infiltrateDie) <= infiltrationRisk(state, unit, colony);
  events.push({ type: 'colonyInfiltrated', colonyId: colony.id, unitId: unit.id, player: unit.owner, caught });
  if (!caught) return { ...putUnit(state, { ...unit, movesLeft: 0 }), rng: rng.state() };
  const { [unit.id]: _lost, ...units } = state.units;
  return { ...state, units, colonies: { ...state.colonies, [colony.id]: { ...colony, goods: addGoods(colony.goods, 'horses', NAVAL.scoutHorses) } }, rng: rng.state() };
}
