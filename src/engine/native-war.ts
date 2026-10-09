// Fighting and dealing between natives and colonists (R-506): Europeans attacking braves and
// settlements, braves attacking units and raiding colonies, and what a brave does when it calls
// at a colony. Which braves go where is R-507; this module decides what happens when they get there.
import { adjustTribalAlarm, settlementAlarm, tribalAlarm, type AlarmEvent, type AlarmSink } from './alarm';
import { braveTypeFor } from './braves';
import { addGoods, amountOf, equipmentOf } from './cargo';
import { coloniesOf } from './colony';
import { promoteWinner, unitBeaten, type BattleEvent } from './battle';
import { combatOdds, pickDefender, rollCombat, type Fighter } from './combat';
import { BUILDING_CHAINS, type BuildingId } from './data/buildings';
import { BRAVE_WITH_HORSES, BRAVE_WITH_MUSKETS, COMBAT } from './data/combat';
import { GOOD_IDS, type GoodId } from './data/goods';
import { NATIVE_WAR as W, RAID_SPARES, TREASURE } from './data/native-war';
import { NATIVES, TRIBES, type TribeId } from './data/tribes';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { bidPrice } from './market';
import { forcedConvert, visitConvert, type MissionEvent } from './missions';
import { settlementEconomy } from './native-economy';
import { warehouseCapacity } from './pioneer';
import { createRng, type Rng } from './rng';
import { damageShip, type ShipEvent, type ShipSink } from './ships';
import { braveId, homeOfBrave, markHomelands, settlementAt, tribeOfOwner, tribeOwner } from './settlements';
import { colonyAt, type Colony, type GameState, type Goods, type NativeDemand, type Player, type PlayerId, type Settlement, type TribeState, type Unit } from './state';

export type RaidOutcome = 'nothing' | 'goods' | 'building' | 'ship' | 'gold';

export type NativeWarEvent =
  | AlarmEvent
  | ShipEvent
  | MissionEvent
  | BattleEvent
  | { readonly type: 'braveArmed'; readonly unitId: string; readonly became: UnitTypeId }
  | { readonly type: 'settlementDamaged'; readonly settlementId: string; readonly population: number }
  | { readonly type: 'settlementDestroyed'; readonly settlementId: string; readonly tribe: TribeId; readonly by: PlayerId; readonly capital: boolean; readonly treasure: number; readonly treasureUnitId: string | null }
  | { readonly type: 'tribeExtinct'; readonly tribe: TribeId }
  | { readonly type: 'tribeCowed'; readonly tribe: TribeId; readonly player: PlayerId }
  | { readonly type: 'colonyBurned'; readonly colonyId: string; readonly name: string; readonly owner: PlayerId; readonly tribe: TribeId; readonly lost: Goods }
  | { readonly type: 'colonyRaided'; readonly colonyId: string; readonly tribe: TribeId; readonly outcome: RaidOutcome; readonly good: GoodId | null; readonly amount: number; readonly building: BuildingId | null }
  | { readonly type: 'nativeGift'; readonly colonyId: string; readonly settlementId: string; readonly good: GoodId; readonly amount: number }
  | { readonly type: 'nativeVisit'; readonly colonyId: string; readonly settlementId: string; readonly friendly: boolean }
  | { readonly type: 'nativeDemand'; readonly player: PlayerId; readonly demand: NativeDemand }
  | { readonly type: 'demandAnswered'; readonly player: PlayerId; readonly demand: NativeDemand; readonly given: boolean; readonly taken: number };

export type NativeWarErrorCode = 'noTarget' | 'cannotAttack' | 'noMovesLeft' | 'landFirst' | 'noDemand';
export type NativeWarCheck = { readonly ok: true } | { readonly ok: false; readonly code: NativeWarErrorCode; readonly message: string };
const no = (code: NativeWarErrorCode, message: string): NativeWarCheck => ({ ok: false, code, message });

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const levelFor = (state: GameState, player: Player | undefined): number => (player?.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : 0);
const putUnit = (state: GameState, unit: Unit): GameState => ({ ...state, units: { ...state.units, [unit.id]: unit } });
const dropUnit = (state: GameState, id: string): GameState => {
  const { [id]: _gone, ...units } = state.units;
  return { ...state, units };
};
const putColony = (state: GameState, colony: Colony): GameState => ({ ...state, colonies: { ...state.colonies, [colony.id]: colony } });
const putSettlement = (state: GameState, s: Settlement): GameState => ({ ...state, settlements: { ...state.settlements, [s.id]: s } });
const putTribe = (state: GameState, tribe: TribeId, change: (t: TribeState) => TribeState): GameState => {
  const record = state.tribes[tribe];
  return record ? { ...state, tribes: { ...state.tribes, [tribe]: change(record) } } : state;
};
const setSettlementAlarm = (state: GameState, id: string, playerId: PlayerId, to: (now: number) => number): GameState => {
  const s = state.settlements[id];
  return s ? putSettlement(state, { ...s, alarm: { ...s.alarm, [playerId]: Math.max(0, to(s.alarm[playerId] ?? 0)) } }) : state;
};
const isNativeUnit = (u: Unit): boolean => UNIT_TYPES[u.type].native === true;
const sumGoods = (a: Goods, b: Goods): Goods => {
  let total = a;
  for (const g of GOOD_IDS) if ((b[g] ?? 0) > 0) total = addGoods(total, g, b[g] ?? 0);
  return total;
};

// --- what becomes of the beaten -------------------------------------------------------------------------

/** A destroyed brave's muskets and horses go home half the time (always, if `certain`). */
function braveFalls(state: GameState, brave: Unit, rng: Rng, events: NativeWarEvent[], certain = false): GameState {
  const tribe = tribeOfOwner(brave.owner);
  let next = dropUnit(state, brave.id);
  events.push({ type: 'unitLost', unitId: brave.id, owner: brave.owner, fate: 'destroyed', became: null, lost: {} });
  if (!tribe || (!certain && rng.int(1, COMBAT.armsRetentionOdds) !== 1)) return next;
  const armed = brave.type === 'armedBrave' || brave.type === 'mountedWarrior';
  const mounted = brave.type === 'mountedBrave' || brave.type === 'mountedWarrior';
  next = putTribe(next, tribe, (t) => ({ ...t, muskets: t.muskets + (armed ? 1 : 0), breeding: t.breeding + (mounted ? COMBAT.horsesReturned : 0) }));
  return next;
}

// --- Europeans attack ---------------------------------------------------------------------------------

/** May this unit attack the natives on the square (dx, dy) away? */
export function checkAttackNatives(state: GameState, unit: Unit, dx: number, dy: number): NativeWarCheck {
  const type = UNIT_TYPES[unit.type];
  if (type.domain !== 'land' || type.attack <= 0) return no('cannotAttack', 'this unit cannot attack');
  if (unit.aboard !== null) return no('landFirst', 'the unit must go ashore before it can attack');
  if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return no('noTarget', 'attacks are made on a neighbouring square');
  const x = unit.x + dx;
  const y = unit.y + dy;
  if (settlementAt(state, x, y)) return { ok: true };
  return Object.values(state.units).some((u) => u.x === x && u.y === y && isNativeUnit(u)) ? { ok: true } : no('noTarget', 'there are no natives there to attack');
}

/** Treasure found in the ruins of a settlement, in gold (0 for none). */
export function treasureFound(_state: GameState, settlement: Settlement, player: Player, rng: Rng): number {
  const tech = TRIBES[settlement.tribe].tech;
  const cortes = player.fathers.includes('hernanCortes');
  const spain = player.nation === 'spain';
  if (tech >= 3) {
    const t = TREASURE.inca;
    return rng.int(t.low, t.high) * ((settlement.capital ? t.capitalBase : t.base) + (cortes ? t.cortes : 0) + (spain ? t.spain : 0)) * t.unit;
  }
  if (tech === 2) {
    const t = TREASURE.aztec;
    const roll = settlement.capital ? rng.int(t.capitalLow, t.capitalHigh) : rng.int(t.low, t.high);
    return (roll + (cortes ? t.cortes : 0) + (spain ? t.spain : 0)) * t.unit;
  }
  const t = tech === 1 ? TREASURE.village : TREASURE.camp;
  const sure = settlement.capital || cortes;
  if (!sure && rng.int(1, spain ? t.spainOdds : t.odds) !== 1) return 0;
  let gold = rng.int(t.low, t.high) * t.unit * (settlement.capital ? TREASURE.capitalFactor : 1);
  if (cortes) gold += Math.trunc(gold / TREASURE.cortesHalf);
  return gold;
}

function destroySettlement(state: GameState, settlement: Settlement, victor: Unit, rng: Rng, events: NativeWarEvent[]): GameState {
  const player = playerOf(state, victor.owner) as Player;
  const gold = treasureFound(state, settlement, player, rng);
  const { [settlement.id]: _gone, ...settlements } = state.settlements;
  let next: GameState = { ...state, settlements };
  // its brave has no home to go back to
  if (next.units[braveId(settlement.id)]) next = dropUnit(next, braveId(settlement.id));
  let treasureUnitId: string | null = null;
  if (gold > 0) {
    treasureUnitId = `u${next.nextId}`;
    const train: Unit = {
      id: treasureUnitId, owner: victor.owner, type: 'treasure', profession: null, x: settlement.x, y: settlement.y, movesLeft: 0, orders: 'none',
      destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: gold, voyage: null,
    };
    next = { ...putUnit(next, train), nextId: next.nextId + 1 };
  }
  next = { ...next, map: markHomelands(next.map, Object.values(next.settlements)) };
  next = { ...next, players: next.players.map((p) => (p.id === player.id ? { ...p, villagesBurned: p.villagesBurned + 1 } : p)) };
  next = putTribe(next, settlement.tribe, (t) => ({ ...t, grudge: t.grudge.includes(player.id) ? t.grudge : [...t.grudge, player.id] }));
  events.push({ type: 'settlementDestroyed', settlementId: settlement.id, tribe: settlement.tribe, by: player.id, capital: settlement.capital, treasure: gold, treasureUnitId });
  const left = Object.values(next.settlements).filter((s) => s.tribe === settlement.tribe);
  if (left.length === 0) events.push({ type: 'tribeExtinct', tribe: settlement.tribe });
  else if (settlement.capital) {
    // the heart goes out of the tribe
    const t = tribalAlarm(next, settlement.tribe, player.id);
    if (t > W.cowedAlarm) next = adjustTribalAlarm(next, settlement.tribe, player.id, W.cowedAlarm - t, rng, events as AlarmSink);
    for (const s of left) next = setSettlementAlarm(next, s.id, player.id, () => 0);
    events.push({ type: 'tribeCowed', tribe: settlement.tribe, player: player.id });
  }
  return next;
}

/** A European unit attacks the brave or the settlement on a neighbouring square. */
export function attackNatives(state: GameState, unit: Unit, dx: number, dy: number, events: NativeWarEvent[]): GameState {
  const rng = createRng(state.rng);
  const x = unit.x + dx;
  const y = unit.y + dy;
  const village = settlementAt(state, x, y);
  const brave = village ? null : pickDefender(state, x, y, unit);
  const tribe = village?.tribe ?? tribeOfOwner(brave?.owner ?? '') ?? 'sioux';
  const player = playerOf(state, unit.owner);

  // whoever wins, the tribe will not forget it
  const anger = (W.attackAlarm + levelFor(state, player)) * (village ? (village.capital ? W.capitalFactor : W.settlementFactor) : 1);
  let next = adjustTribalAlarm(state, tribe, unit.owner, anger, rng, events as AlarmSink);
  if (village) next = setSettlementAlarm(next, village.id, unit.owner, (now) => now + W.attackedSettlementAlarm);

  const defender: Fighter = village
    ? { type: braveTypeFor(next.tribes[tribe], W.mountedDefenderBreeding), profession: null, owner: tribeOwner(tribe), orders: 'none', x, y, movesLeft: 0 }
    : (brave as Unit);
  const odds = combatOdds(next, unit, defender, true);
  const won = rollCombat(next, unit, defender, odds, rng);
  events.push({ type: 'battle', attackerId: unit.id, defenderId: brave?.id ?? null, x, y, attack: odds.attack, defense: odds.defense, attackerWon: won });
  next = putUnit(next, { ...unit, movesLeft: Math.max(0, unit.movesLeft - COMBAT.fullMove) });

  if (!won) {
    next = unitBeaten(next, next.units[unit.id] as Unit, defender, events);
    return { ...next, rng: rng.state() };
  }
  if (village) {
    const now = next.settlements[village.id] as Settlement;
    next = forcedConvert(next, now, unit.owner, unit.x, unit.y, rng, events);
    if (now.population > 1) {
      next = putSettlement(next, { ...now, population: now.population - 1 });
      events.push({ type: 'settlementDamaged', settlementId: now.id, population: now.population - 1 });
    } else next = destroySettlement(next, now, unit, rng, events);
  } else if (brave) next = braveFalls(next, brave, rng, events);
  next = promoteWinner(next, unit, odds, 'attack', rng, events);
  return { ...next, rng: rng.state() };
}

// --- braves attack --------------------------------------------------------------------------------------

/** What a successful raid on a colony carries off or destroys, before fortifications and luck are counted. */
export function raidOutcome(state: GameState, colony: Colony, rng: Rng): RaidOutcome {
  const owner = playerOf(state, colony.owner);
  const human = owner?.kind === 'human';
  const d = human ? DIFFICULTIES.indexOf(state.difficulty) : 0;
  const fort = colony.buildings.includes('fortress') ? 3 : colony.buildings.includes('fort') ? 2 : colony.buildings.includes('stockade') ? 1 : 0;
  const r = rng.int(0, W.raidDie) - 1 + (human ? d - 2 : 0);
  if (r < W.raidPerFort * fort + 1) return 'nothing';
  let o: RaidOutcome = (['goods', 'building', 'ship', 'gold'] as const)[rng.int(1, 4) - 1] as RaidOutcome;
  const mercy = human && d <= 1 && state.turn < (W.raidMercyTurns[d] as number);
  if (mercy && (o === 'building' || o === 'ship')) return 'nothing';
  if (o === 'building' && (fort >= 2 || rng.int(0, 8) > (human ? d : 1) + 2)) o = 'goods';
  if (o === 'gold' && fort >= 1) o = 'goods';
  if (o === 'ship' && fort >= 3) return 'nothing';
  if (o === 'goods' && fort >= 1 && rng.int(0, 8) > d) return 'nothing';
  return o;
}

function raid(state: GameState, colony: Colony, tribe: TribeId, rng: Rng, events: NativeWarEvent[]): GameState {
  let outcome = raidOutcome(state, colony, rng);
  let next = state;
  let good: GoodId | null = null;
  let amount = 0;
  let building: BuildingId | null = null;
  const owner = playerOf(state, colony.owner) as Player;
  if (outcome === 'goods') {
    const stocked = GOOD_IDS.filter((g) => amountOf(colony.goods, g) >= W.raidStockMinimum);
    if (stocked.length === 0) outcome = 'nothing';
    else {
      const wantsHorses = (state.tribes[tribe]?.horses ?? 0) === 0 && stocked.includes('horses') && rng.int(0, 1) === 0;
      good = wantsHorses ? 'horses' : rng.pick(stocked);
      const stock = amountOf(colony.goods, good);
      amount = rng.int(Math.min(W.raidStockMinimum, stock >> 1), stock >> 1);
      next = putColony(next, { ...colony, goods: addGoods(colony.goods, good, -amount) });
      if (good === 'horses') next = putTribe(next, tribe, (t) => ({ ...t, horses: t.horses + 1, breeding: t.breeding + W.raidHorsesBreeding }));
      if (good === 'muskets') next = putTribe(next, tribe, (t) => ({ ...t, muskets: t.muskets + (amount >= 50 ? 2 : 1) }));
    }
  } else if (outcome === 'building') {
    const building0 = colony.construction?.kind === 'building' ? colony.construction.id : null;
    const chains = (Object.values(BUILDING_CHAINS) as readonly (readonly BuildingId[])[]).filter((chain) =>
      chain.some((b) => colony.buildings.includes(b)) && !(building0 && chain.includes(building0)));
    const targets = chains.map((chain) => [...chain].reverse().find((b) => colony.buildings.includes(b)) as BuildingId).filter((b) => !RAID_SPARES.includes(b));
    if (targets.length === 0) outcome = 'nothing';
    else {
      building = rng.pick(targets);
      next = putColony(next, { ...colony, buildings: colony.buildings.filter((b) => b !== building) });
    }
  } else if (outcome === 'ship') {
    const ship = Object.values(state.units).find((u) => u.x === colony.x && u.y === colony.y && u.owner === colony.owner && u.voyage === null && UNIT_TYPES[u.type].domain === 'sea' && u.repair === 0);
    if (!ship) outcome = 'nothing';
    else next = damageShip(next, ship.id, events as ShipSink);
  } else if (outcome === 'gold') {
    const people = coloniesOf(state, owner.id).reduce((n, c) => n + c.colonists.length, 0);
    const high = Math.trunc((owner.gold * colony.colonists.length) / (people + 1)) + 10;
    amount = high >= W.raidGoldMinimum ? rng.int(W.raidGoldMinimum, high) : W.raidGoldMinimum;
    if (owner.gold < amount) {
      outcome = 'nothing';
      amount = 0;
    } else next = { ...next, players: next.players.map((p) => (p.id === owner.id ? { ...p, gold: p.gold - amount } : p)) };
  }
  events.push({ type: 'colonyRaided', colonyId: colony.id, tribe, outcome, good, amount, building });
  if (outcome !== 'nothing') next = adjustTribalAlarm(next, tribe, owner.id, W.raidAlarm[outcome], rng, events as AlarmSink);
  return next;
}

function burnColony(state: GameState, colony: Colony, tribe: TribeId, events: NativeWarEvent[]): GameState {
  // everyone on the square dies, and whatever the colony and its ships held is lost
  const units: Record<string, Unit> = {};
  let lost: Goods = colony.goods;
  for (const u of Object.values(state.units)) {
    if (u.x === colony.x && u.y === colony.y && u.voyage === null && !isNativeUnit(u)) lost = sumGoods(sumGoods(lost, u.cargo), equipmentOf(u));
    else units[u.id] = u;
  }
  const { [colony.id]: _gone, ...colonies } = state.colonies;
  const tiles = state.map.tiles.map((t, i) => (i === colony.y * state.map.width + colony.x && t.claim !== null ? { ...t, claim: null } : t));
  const tradeRoutes = Object.fromEntries(Object.entries(state.tradeRoutes).filter(([, r]) => !r.stops.some((s) => s.colonyId === colony.id)));
  let next: GameState = { ...state, units, colonies, tradeRoutes, map: { ...state.map, tiles } };
  next = putTribe(next, tribe, (t) => ({ ...t, horses: t.horses + (amountOf(colony.goods, 'horses') > 0 ? 1 : 0), muskets: t.muskets + (amountOf(colony.goods, 'muskets') > 0 ? 1 : 0) }));
  events.push({ type: 'colonyBurned', colonyId: colony.id, name: colony.name, owner: colony.owner, tribe, lost });
  return next;
}

/** A winning brave helps itself to the loser's horses or muskets. */
function plunderArms(state: GameState, brave: Unit, loser: Unit, events: NativeWarEvent[]): GameState {
  const tribe = tribeOfOwner(brave.owner);
  let became: UnitTypeId | undefined;
  let horses = false;
  if (loser.type === 'dragoon' || loser.type === 'scout') {
    became = (BRAVE_WITH_HORSES as Partial<Record<UnitTypeId, UnitTypeId>>)[brave.type];
    horses = became !== undefined;
  } else if (loser.type === 'soldier') became = (BRAVE_WITH_MUSKETS as Partial<Record<UnitTypeId, UnitTypeId>>)[brave.type];
  if (!became || !state.units[brave.id]) return state;
  events.push({ type: 'braveArmed', unitId: brave.id, became });
  let next = putUnit(state, { ...(state.units[brave.id] as Unit), type: became });
  if (horses && tribe) next = putTribe(next, tribe, (t) => ({ ...t, horses: t.horses + 1 }));
  return next;
}

/** A brave falls on the European unit or colony on a neighbouring square. */
export function braveAttacks(state: GameState, braveUnitId: string, x: number, y: number, events: NativeWarEvent[]): GameState {
  const brave = state.units[braveUnitId];
  const tribe = brave ? tribeOfOwner(brave.owner) : null;
  if (!brave || !tribe) return state;
  const rng = createRng(state.rng);
  const colony = colonyAt(state, x, y);
  const real = pickDefender(state, x, y, brave);
  const target = colony?.owner ?? real?.owner;
  const victim = target ? playerOf(state, target) : undefined;
  if (!victim || (!colony && !real)) return state;
  const d = levelFor(state, victim);
  const home = homeOfBrave(state, brave.id);

  let drafted: Fighter | null = null;
  if (colony && !real) {
    // nobody under arms: a colonist takes up what there is (muskets, with Revere)
    const revere = victim.fathers.includes('paulRevere') && amountOf(colony.goods, 'muskets') >= 50;
    drafted = { type: revere ? 'soldier' : 'colonist', profession: 'freeColonist', owner: colony.owner, orders: 'none', x, y, movesLeft: 0 };
  }
  const defender = (real ?? drafted) as Fighter;
  const attacker: Fighter = { ...brave, movesLeft: Math.max(brave.movesLeft, COMBAT.fullMove) };
  const odds = combatOdds(state, attacker, defender, true, drafted !== null);
  const won = rollCombat(state, attacker, defender, odds, rng);
  events.push({ type: 'battle', attackerId: brave.id, defenderId: real?.id ?? null, x, y, attack: odds.attack, defense: odds.defense, attackerWon: won });
  let next = putUnit(state, { ...brave, movesLeft: 0 });
  if (home) next = setSettlementAlarm(next, home.id, victim.id, () => 0);

  if (!won) {
    next = braveFalls(next, brave, rng, events);
    if (real) next = promoteWinner(next, real, odds, 'defense', rng, events);
    return { ...next, rng: rng.state() };
  }
  if (!colony) {
    next = unitBeaten(next, real as Unit, brave, events);
    next = plunderArms(next, brave, real as Unit, events);
    next = adjustTribalAlarm(next, tribe, victim.id, W.wonUnitAlarm + (victim.kind === 'human' ? d >> 1 : 0), rng, events as AlarmSink);
    return { ...next, rng: rng.state() };
  }
  if (real) next = unitBeaten(next, real, brave, events);
  if (!real && colony.colonists.length <= 1) {
    next = burnColony(next, colony, tribe, events);
    next = adjustTribalAlarm(next, tribe, victim.id, W.burnedColonyAlarm, rng, events as AlarmSink);
    return { ...next, rng: rng.state() };
  }
  next = adjustTribalAlarm(next, tribe, victim.id, W.wonColonyAlarm + d, rng, events as AlarmSink);
  next = raid(next, next.colonies[colony.id] as Colony, tribe, rng, events);
  // the raiders melt away with what they took; the settlement will raise another band
  next = braveFalls(next, brave, rng, [], true);
  return { ...next, rng: rng.state() };
}

// --- a brave calls at a colony ---------------------------------------------------------------------------

/** Bring tribal alarm down by `by`, and then in fives until it is no higher than the appeased level. */
function appease(state: GameState, tribe: TribeId, playerId: PlayerId, by: number, rng: Rng, events: NativeWarEvent[]): GameState {
  let next = adjustTribalAlarm(state, tribe, playerId, -by, rng, events as AlarmSink);
  for (let guard = 0; guard < 10 && tribalAlarm(next, tribe, playerId) > W.appeasedAlarm; guard++) next = adjustTribalAlarm(next, tribe, playerId, -W.begRelief, rng, events as AlarmSink);
  return next;
}

/** The good a brave would demand of this colony and how much: whatever is worth most to his people. */
export function reparation(state: GameState, colony: Colony, tribe: TribeId, rng: Rng): { good: GoodId; amount: number } | null {
  const record = state.tribes[tribe];
  const owner = playerOf(state, colony.owner);
  const d = levelFor(state, owner);
  let best: { good: GoodId; amount: number } | null = null;
  let bestValue = 0;
  for (const good of GOOD_IDS) {
    const stock = Math.min(100, amountOf(colony.goods, good));
    if (stock <= 0) continue;
    let worth = bidPrice(state, colony.owner, good) + 1;
    if (good === 'horses') worth += 10 - (record?.horses ?? 0);
    if (good === 'muskets') worth += rng.int(1, 4) - TRIBES[tribe].tech + d + 4;
    if (worth * stock > bestValue) {
      best = { good, amount: stock };
      bestValue = worth * stock;
    }
  }
  if (best && rng.int(0, d + 1) === 0) best = { good: best.good, amount: Math.max(1, best.amount >> 1) };
  return best;
}

function friendlyGift(state: GameState, settlement: Settlement, colony: Colony, rng: Rng, events: NativeWarEvent[]): GameState {
  const { supply, demand } = settlementEconomy(state, settlement);
  const food = amountOf(colony.goods, 'food');
  if (supply.food > demand.food && food <= W.foodGiftWhenAtMost) {
    const amount = W.foodGiftUpTo - food;
    events.push({ type: 'nativeGift', colonyId: colony.id, settlementId: settlement.id, good: 'food', amount });
    return putColony(state, { ...colony, goods: addGoods(colony.goods, 'food', amount) });
  }
  const capacity = warehouseCapacity(colony);
  const tech = TRIBES[settlement.tribe].tech;
  const choices = GOOD_IDS.filter((g) => g !== 'food' && supply[g] > 0 && (g !== 'silver' || tech >= 2) && amountOf(colony.goods, g) < capacity)
    .sort((a, b) => supply[b] - supply[a]).slice(0, 3);
  if (choices.length === 0) return state;
  const good = rng.pick(choices);
  const wanted = Math.max(W.giftLeast, Math.min(Math.trunc(100 / (bidPrice(state, colony.owner, good) + 2)), supply[good] + 5, W.giftMost));
  const amount = Math.max(W.giftFloor, Math.min(wanted, capacity - amountOf(colony.goods, good)));
  events.push({ type: 'nativeGift', colonyId: colony.id, settlementId: settlement.id, good, amount });
  return putColony(state, { ...colony, goods: addGoods(colony.goods, good, amount) });
}

/** Carry out a demand that is being met, or the grievance of one refused. */
function settleDemand(state: GameState, playerId: PlayerId, demand: NativeDemand, give: boolean, rng: Rng, events: NativeWarEvent[]): GameState {
  const settlement = state.settlements[demand.settlementId];
  const colony = state.colonies[demand.colonyId];
  const taken = give && colony ? Math.min(demand.amount, amountOf(colony.goods, demand.good)) : 0;
  events.push({ type: 'demandAnswered', player: playerId, demand, given: give, taken });
  if (!settlement || !colony) return state;
  if (!give) {
    return demand.kind === 'beg'
      ? setSettlementAlarm(state, settlement.id, playerId, (now) => now + (now >> 1))
      : setSettlementAlarm(state, settlement.id, playerId, (now) => now + W.refusalAlarm);
  }
  const amount = Math.min(demand.amount, amountOf(colony.goods, demand.good));
  let next = putColony(state, { ...colony, goods: addGoods(colony.goods, demand.good, -amount) });
  next = setSettlementAlarm(next, settlement.id, playerId, () => 0);
  if (demand.kind === 'beg') return appease(next, settlement.tribe, playerId, W.begRelief * (settlement.capital ? 2 : 1), rng, events);
  const value = (bidPrice(state, playerId, demand.good) + 1) * amount;
  next = appease(next, settlement.tribe, playerId, Math.trunc((4 * value) / 100), rng, events);
  // arms and mounts go straight to the brave at the gate, or failing that to the tribe
  const brave = next.units[braveId(settlement.id)];
  if (demand.good === 'muskets') {
    const became = brave ? (BRAVE_WITH_MUSKETS as Partial<Record<UnitTypeId, UnitTypeId>>)[brave.type] : undefined;
    next = became && brave ? putUnit(next, { ...brave, type: became }) : putTribe(next, settlement.tribe, (t) => ({ ...t, muskets: t.muskets + 1 }));
  } else if (demand.good === 'horses') {
    const became = brave ? (BRAVE_WITH_HORSES as Partial<Record<UnitTypeId, UnitTypeId>>)[brave.type] : undefined;
    next = became && brave ? putUnit(next, { ...brave, type: became }) : putTribe(next, settlement.tribe, (t) => ({ ...t, breeding: t.breeding + W.reparationBreeding }));
    next = putTribe(next, settlement.tribe, (t) => ({ ...t, horses: t.horses + 1 }));
  }
  return next;
}

/** Would a computer power meet this demand? It feeds beggars (Spain does not) and pays up unless asked for muskets or well defended. */
function aiGives(state: GameState, player: Player, demand: NativeDemand): boolean {
  if (demand.kind === 'beg') return player.nation !== 'spain';
  const colony = state.colonies[demand.colonyId];
  const defended = colony ? Object.values(state.units).some((u) => u.x === colony.x && u.y === colony.y && u.owner === player.id && UNIT_TYPES[u.type].attack > 1) : false;
  return demand.good !== 'muskets' && !defended;
}

/**
 * A brave has come to a colony's gate. If his tribe is not at war with it he may bring a
 * convert or a gift, beg for food, or demand goods; a human owner answers demands on its turn.
 */
export function braveVisits(state: GameState, braveUnitId: string, colonyId: string, events: NativeWarEvent[]): GameState {
  const brave = state.units[braveUnitId];
  const colony = state.colonies[colonyId];
  const home = brave ? homeOfBrave(state, brave.id) : null;
  const owner = colony ? playerOf(state, colony.owner) : undefined;
  if (!brave || !colony || !home || !owner) return state;
  const tribe = home.tribe;
  const rng = createRng(state.rng);
  const done = (next: GameState): GameState => ({ ...next, rng: rng.state() });
  const t = tribalAlarm(state, tribe, owner.id);
  const s = settlementAlarm(home, owner.id);
  const visited = state.tribes[tribe]?.visited[owner.id] ?? 0;
  if (t >= NATIVES.alarmLevels[2]) return state;
  if ((s >= NATIVES.settlementHostile || visited === 1) && rng.int(1, 128) <= s - 129) return done(state);
  let friendly = s < NATIVES.settlementHostile && 4 * Math.max(0, t - W.friendlyAlarmFrom) + s <= rng.int(1, W.friendlyDie);
  const mark = (next: GameState, value: number): GameState => putTribe(next, tribe, (r) => ({ ...r, visited: { ...r.visited, [owner.id]: value } }));
  let next = state;
  let state2 = visited;
  if (t >= NATIVES.alarmLevels[1]) {
    friendly = false;
    state2 = 2;
    next = mark(next, 2);
  }

  // hunger first
  const { supply, demand } = settlementEconomy(state, home);
  const hunger = demand.food - supply.food;
  if (hunger > 0 && amountOf(colony.goods, 'food') >= W.begFoodAtLeast && rng.int(1, 100) <= hunger) {
    const ask: NativeDemand = { kind: 'beg', settlementId: home.id, colonyId, good: 'food', amount: amountOf(colony.goods, 'food') >> 1 };
    events.push({ type: 'nativeDemand', player: owner.id, demand: ask });
    if (owner.kind === 'human') return done({ ...next, players: next.players.map((p) => (p.id === owner.id ? { ...p, demands: [...p.demands, ask] } : p)) });
    return done(settleDemand(next, owner.id, ask, aiGives(next, owner, ask), rng, events));
  }

  if (friendly) {
    events.push({ type: 'nativeVisit', colonyId, settlementId: home.id, friendly: true });
    next = setSettlementAlarm(mark(next, 2), home.id, owner.id, () => 0);
    const before = Object.keys(next.units).length;
    next = visitConvert(next, next.settlements[home.id] as Settlement, owner.id, colony.x, colony.y, rng, events);
    if (Object.keys(next.units).length === before) next = friendlyGift(next, next.settlements[home.id] as Settlement, next.colonies[colonyId] as Colony, rng, events);
    return done(next);
  }
  if (state2 === 2) {
    // sour looks, nothing more
    events.push({ type: 'nativeVisit', colonyId, settlementId: home.id, friendly: false });
    return done(setSettlementAlarm(next, home.id, owner.id, () => 0));
  }
  const wanted = reparation(next, colony, tribe, rng);
  if (!wanted) return done(next);
  next = mark(next, 1);
  const ask: NativeDemand = { kind: 'demand', settlementId: home.id, colonyId, good: wanted.good, amount: wanted.amount };
  events.push({ type: 'nativeDemand', player: owner.id, demand: ask });
  if (owner.kind === 'human') return done({ ...next, players: next.players.map((p) => (p.id === owner.id ? { ...p, demands: [...p.demands, ask] } : p)) });
  return done(settleDemand(next, owner.id, ask, aiGives(next, owner, ask), rng, events));
}

export function checkAnswerDemand(state: GameState, playerId: PlayerId, index: number): NativeWarCheck {
  return playerOf(state, playerId)?.demands[index] ? { ok: true } : no('noDemand', 'nothing is being asked of us');
}

export function answerDemand(state: GameState, playerId: PlayerId, index: number, give: boolean, events: NativeWarEvent[]): GameState {
  const player = playerOf(state, playerId) as Player;
  const demand = player.demands[index] as NativeDemand;
  const rng = createRng(state.rng);
  const cleared: GameState = { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, demands: p.demands.filter((_, i) => i !== index) } : p)) };
  return { ...settleDemand(cleared, playerId, demand, give, rng, events), rng: rng.state() };
}

/** A new turn for the tribes: yesterday's visits are forgotten. */
export function clearVisits(state: GameState): GameState {
  let next = state;
  for (const [tribe, record] of Object.entries(state.tribes)) {
    if (record && Object.keys(record.visited).length > 0) next = { ...next, tribes: { ...next.tribes, [tribe]: { ...record, visited: {} } } };
  }
  return next;
}
