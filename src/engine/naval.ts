// Fighting at sea (R-602): warships attacking ships, evasion, sinking or crippling, prizes, the
// zone of patrol around warships, and the guns of forts.
import { goToWar, type BattleEvent, type BattleSink } from './battle';
import { addGoods, amountOf, holdsFree, holdsUsed } from './cargo';
import { coloniesOf } from './colony';
import { fortLevel } from './combat';
import { COMBAT } from './data/combat';
import { privateerOutrage } from './diplomacy';
import { GOOD_IDS, type GoodId } from './data/goods';
import { NAVAL } from './data/naval';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { bidPrice } from './market';
import { turnMoves } from './movement';
import { createRng, type Rng } from './rng';
import { damageShip, sinkShip, type ShipEvent, type ShipSink } from './ships';
import { colonyAt, type Colony, type GameState, type Player, type Unit } from './state';
import { isWater } from './tile';

export type NavalEvent =
  | BattleEvent
  | ShipEvent
  /** The quarry showed a clean pair of heels. */
  | { readonly type: 'shipEvaded'; readonly attackerId: string; readonly defenderId: string }
  | { readonly type: 'cargoCaptured'; readonly winnerId: string; readonly loserId: string; readonly good: GoodId; readonly amount: number }
  /** A ship passing a warship was slowed (`cost` thirds of a move), or slipped past (`cost` 0). */
  | { readonly type: 'shipSlowed'; readonly unitId: string; readonly by: string; readonly cost: number }
  | { readonly type: 'fortFired'; readonly colonyId: string; readonly unitId: string; readonly hit: boolean };

export type NavalErrorCode = 'noTarget' | 'cannotAttack' | 'noMovesLeft' | 'underRepair';
export type NavalCheck = { readonly ok: true } | { readonly ok: false; readonly code: NavalErrorCode; readonly message: string };
const no = (code: NavalErrorCode, message: string): NavalCheck => ({ ok: false, code, message });

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';
const isWarship = (u: Unit): boolean => (NAVAL.warships as readonly UnitTypeId[]).includes(u.type);
const levelFor = (state: GameState, owner: string): number | null => (playerOf(state, owner)?.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : null);
/** Holds in use: cargo and passengers alike weigh a ship down. */
const laden = (state: GameState, ship: Unit): number => holdsUsed(state, ship);
const atPeace = (state: GameState, a: string, b: string): boolean => playerOf(state, a)?.stance[b] === 'peace';

/** A ship's strength in eighths: its table value, half again for a privateer under Drake, less an eighth for each hold in use. */
export function shipStrength(state: GameState, ship: Unit, side: 'attack' | 'defense'): number {
  const type = UNIT_TYPES[ship.type];
  let s = (side === 'attack' ? type.attack : type.defense) * COMBAT.scale;
  if (ship.type === 'privateer' && playerOf(state, ship.owner)?.fathers.includes('francisDrake')) s += Math.trunc(s / 2);
  return Math.max(0, s - NAVAL.cargoPenalty * laden(state, ship));
}

/** Both sides' strength when one ship attacks another: no ground and no digging in at sea. */
export function navalOdds(state: GameState, attacker: Unit, defender: Unit): { attack: number; defense: number } {
  let attack = shipStrength(state, attacker, 'attack');
  attack += Math.trunc(attack / 2);
  let defense = shipStrength(state, defender, 'defense');
  const a = levelFor(state, attacker.owner);
  const d = levelFor(state, defender.owner);
  if (a !== null) attack += COMBAT.humanNudgeFrom - a;
  if (d !== null) defense += COMBAT.humanNudgeFrom - d;
  if (attacker.movesLeft < COMBAT.fullMove) attack = Math.trunc((attack * Math.max(0, attacker.movesLeft)) / COMBAT.fullMove);
  return { attack, defense };
}

/** How nimble a ship is, for running away and for slipping past a patrol. */
export function evasionWeight(state: GameState, ship: Unit): number {
  let w = turnMoves(state, ship) + NAVAL.evadeBase;
  if (ship.type === 'privateer') w *= 2;
  if (ship.type === 'galleon') w += NAVAL.evadeGalleon;
  return Math.max(1, w - NAVAL.evadePerCargo * laden(state, ship));
}

/** The ship that answers for a sea square: the one that defends best. */
export function seaDefender(state: GameState, x: number, y: number, attacker: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = -1;
  for (const u of Object.values(state.units)) {
    if (u.x !== x || u.y !== y || u.voyage !== null || !isShip(u) || u.owner === attacker.owner || !playerOf(state, u.owner)) continue;
    const d = shipStrength(state, u, 'defense');
    if (d > bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

/** May this ship attack the ship on the square (dx, dy) away? Only the three kinds of warship fight. */
export function checkNavalAttack(state: GameState, ship: Unit, dx: number, dy: number): NavalCheck {
  if (!isShip(ship) || !isWarship(ship)) return no('cannotAttack', 'only privateers, frigates and men-of-war can attack at sea');
  if (ship.repair > 0) return no('underRepair', 'the ship is under repair');
  if (ship.movesLeft <= 0) return no('noMovesLeft', `unit ${ship.id} has no moves left`);
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return no('noTarget', 'attacks are made on a neighbouring square');
  const x = ship.x + dx;
  const y = ship.y + dy;
  const tile = state.map.tiles[y * state.map.width + x];
  if (!tile || !isWater(tile) || colonyAt(state, x, y)) return no('noTarget', 'there is no ship there to attack');
  return seaDefender(state, x, y, ship) ? { ok: true } : no('noTarget', 'there is no ship there to attack');
}

/**
 * Is the beaten ship sunk rather than crippled? By the victor's guns against its hull, and then
 * by the state of its owner's fleet: big fleets lose ships outright, but a power is not left
 * without its last transports or its only ship of a kind.
 */
export function isSunk(state: GameState, loser: Unit, guns: number, victor: Unit | null, rng: Rng): boolean {
  const hull = UNIT_TYPES[loser.type].hull;
  let sunk = guns > 0 && rng.int(1, guns + hull) > hull;
  const owner = playerOf(state, loser.owner);
  if (!owner) return sunk;
  const fleet = Object.values(state.units).filter((u) => u.owner === loser.owner && isShip(u));
  const warships = fleet.filter(isWarship);
  const sameKind = fleet.filter((u) => u.type === loser.type).length;
  const colonies = coloniesOf(state, loser.owner);
  if (!isWarship(loser)) {
    if (fleet.length - warships.length > NAVAL.bigFleet || (loser.type === 'caravel' && state.turn >= NAVAL.caravelExpendableFrom)) sunk = true;
    const holds = fleet.reduce((n, u) => n + UNIT_TYPES[u.type].holds, 0) - UNIT_TYPES[loser.type].holds
      - 4 * fleet.filter((u) => u.type === 'frigate').length - fleet.filter((u) => u.type === 'privateer').length;
    const colonists = colonies.reduce((n, c) => n + c.colonists.length, 0);
    if (holds < Math.min(NAVAL.transportFloor[1], Math.max(NAVAL.transportFloor[0], colonists >> 2))) sunk = false;
  } else if (!state.players.some((p) => p.atWar)) {
    const theirs = victor ? Object.values(state.units).filter((u) => u.owner === victor.owner && u.type === 'frigate').length : 0;
    if (sameKind > colonies.length || warships.length > NAVAL.bigFleet || (loser.type === 'frigate' && victor?.type === 'frigate' && sameKind > theirs)) sunk = true;
    if (sameKind === 1 && colonies.length >= 1) sunk = false;
  }
  return sunk;
}

/** The victor helps itself to the loser's cargo, the most valuable first, while it has room. */
function takePrizes(state: GameState, winner: Unit, loser: Unit, events: NavalEvent[]): GameState {
  let next = state;
  const lots = GOOD_IDS.filter((g) => amountOf(loser.cargo, g) > 0).sort((a, b) => bidPrice(state, winner.owner, b) * amountOf(loser.cargo, b) - bidPrice(state, winner.owner, a) * amountOf(loser.cargo, a));
  for (const good of lots) {
    let left = amountOf((next.units[loser.id] as Unit).cargo, good);
    while (left > 0 && holdsFree(next, next.units[winner.id] as Unit) > 0) {
      const amount = Math.min(100, left);
      const w = next.units[winner.id] as Unit;
      const l = next.units[loser.id] as Unit;
      next = { ...next, units: { ...next.units, [w.id]: { ...w, cargo: addGoods(w.cargo, good, amount) }, [l.id]: { ...l, cargo: addGoods(l.cargo, good, -amount) } } };
      events.push({ type: 'cargoCaptured', winnerId: winner.id, loserId: loser.id, good, amount });
      left -= amount;
    }
  }
  return next;
}

function shipBeaten(state: GameState, loser: Unit, victor: Unit, rng: Rng, events: NavalEvent[]): GameState {
  const next = takePrizes(state, victor, loser, events);
  const sunk = isSunk(next, loser, UNIT_TYPES[victor.type].guns, victor, rng);
  return sunk ? sinkShip(next, loser.id, events as ShipSink) : damageShip(next, loser.id, events as ShipSink, null, { combat: UNIT_TYPES[victor.type].defense, ship: true });
}

/** A warship attacks the ship on a neighbouring sea square. */
export function navalAttack(state: GameState, ship: Unit, dx: number, dy: number, events: NavalEvent[]): GameState {
  const x = ship.x + dx;
  const y = ship.y + dy;
  const defender = seaDefender(state, x, y, ship) as Unit;
  const rng = createRng(state.rng);
  // a privateer flies no flag: its attacks are nobody's act of war
  let next = ship.type === 'privateer' ? privateerOutrage(state, ship.owner, defender.owner, rng) : goToWar(state, ship.owner, defender.owner, events as BattleSink);
  next = { ...next, units: { ...next.units, [ship.id]: { ...ship, movesLeft: Math.max(0, ship.movesLeft - COMBAT.fullMove) } } };
  const done = (s: GameState): GameState => ({ ...s, rng: rng.state() });

  if (UNIT_TYPES[defender.type].attack < UNIT_TYPES[ship.type].attack) {
    const run = evasionWeight(state, defender);
    if (rng.int(1, evasionWeight(state, ship) + run) <= run) {
      events.push({ type: 'shipEvaded', attackerId: ship.id, defenderId: defender.id });
      return done(next);
    }
  }
  const odds = navalOdds(state, ship, defender);
  const total = odds.attack + odds.defense;
  const won = total > 0 && rng.int(1, total) <= odds.attack;
  events.push({ type: 'battle', attackerId: ship.id, defenderId: defender.id, x, y, attack: odds.attack, defense: odds.defense, attackerWon: won });
  if (!won) return done(shipBeaten(next, next.units[ship.id] as Unit, defender, rng, events));
  next = shipBeaten(next, defender, next.units[ship.id] as Unit, rng, events);
  // the victor takes the loser's water if nothing else holds it
  const held = Object.values(next.units).some((u) => u.x === x && u.y === y && u.voyage === null && u.id !== ship.id);
  if (!held) {
    const moved: Record<string, Unit> = { ...next.units, [ship.id]: { ...(next.units[ship.id] as Unit), x, y } };
    for (const u of Object.values(next.units)) if (u.aboard === ship.id) moved[u.id] = { ...u, x, y };
    next = { ...next, units: moved };
  }
  return done(next);
}

/**
 * After a ship's step: warships of powers it is not at peace with (anybody's, for or against a
 * privateer) on the squares around may hold it up; so may a fort or fortress it ends beside.
 */
export function patrolAndForts(state: GameState, shipId: string, events: NavalEvent[]): GameState {
  const start = state.units[shipId];
  if (!start || !isShip(start) || start.voyage !== null) return state;
  const tile = state.map.tiles[start.y * state.map.width + start.x];
  if (!tile || !isWater(tile)) return state;
  const rng = createRng(state.rng);
  let moves = start.movesLeft;
  let rolled = false;
  const hostile = (owner: string, privateer: boolean): boolean => owner !== start.owner && playerOf(state, owner) !== undefined && (privateer || start.type === 'privateer' || !atPeace(state, start.owner, owner));
  for (const u of Object.values(state.units)) {
    if (moves <= 0) break;
    if (!isShip(u) || !isWarship(u) || u.voyage !== null || u.repair > 0 || Math.max(Math.abs(u.x - start.x), Math.abs(u.y - start.y)) !== 1) continue;
    if (!hostile(u.owner, u.type === 'privateer') || colonyAt(state, u.x, u.y)) continue;
    const a = evasionWeight(state, start);
    const d = evasionWeight(state, u) + NAVAL.patrolEdge;
    const roll = rng.int(1, a + d);
    rolled = true;
    const full = NAVAL.patrolCost[u.type as keyof typeof NAVAL.patrolCost];
    const cost = roll < a ? 0 : roll === a ? full >> 1 : full;
    moves = Math.max(0, moves - cost);
    events.push({ type: 'shipSlowed', unitId: start.id, by: u.id, cost });
  }
  for (const c of Object.values(state.colonies)) {
    if (moves <= 0) break;
    if (Math.max(Math.abs(c.x - start.x), Math.abs(c.y - start.y)) !== 1 || !hostile(c.owner, false)) continue;
    const level = fortLevel(state, c.x, c.y);
    if (level < 2) continue;
    const cost = level >= 3 ? moves : NAVAL.fortSlow;
    moves = Math.max(0, moves - cost);
    events.push({ type: 'shipSlowed', unitId: start.id, by: c.id, cost });
  }
  if (moves === start.movesLeft && !rolled) return state;
  return { ...state, rng: rng.state(), units: { ...state.units, [start.id]: { ...start, movesLeft: moves } } };
}

/** A colony's fort or fortress fires on the first hostile ship on each sea square beside it. More artillery in the colony, more guns. */
export function fortFire(state: GameState, colony: Colony, events: NavalEvent[]): GameState {
  const level = fortLevel(state, colony.x, colony.y) - 1;
  if (level < 1) return state;
  const artillery = Object.values(state.units).filter((u) => u.x === colony.x && u.y === colony.y && u.owner === colony.owner && u.type === 'artillery').length;
  const strength = NAVAL.fortFirePerLevel * level * (1 + artillery);
  const rng = createRng(state.rng);
  let next = state;
  let fired = false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = colony.x + dx;
      const y = colony.y + dy;
      const tile = next.map.tiles[y * next.map.width + x];
      if ((dx === 0 && dy === 0) || !tile || !isWater(tile)) continue;
      const ship = Object.values(next.units).find((u) => u.x === x && u.y === y && u.voyage === null && isShip(u));
      if (!ship || ship.owner === colony.owner || !playerOf(next, ship.owner)) continue;
      if (ship.type !== 'privateer' && atPeace(next, colony.owner, ship.owner)) continue;
      fired = true;
      let attack = strength * COMBAT.scale;
      attack += Math.trunc(attack / 2);
      const defense = shipStrength(next, ship, 'defense');
      const hit = rng.int(1, attack + defense) <= attack;
      events.push({ type: 'fortFired', colonyId: colony.id, unitId: ship.id, hit });
      if (!hit) continue;
      next = isSunk(next, ship, strength, null, rng) ? sinkShip(next, ship.id, events as ShipSink) : damageShip(next, ship.id, events as ShipSink, null, { combat: strength, ship: false });
    }
  }
  return fired ? { ...next, rng: rng.state() } : state;
}
