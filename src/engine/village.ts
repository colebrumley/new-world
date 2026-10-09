// Entering a native settlement (R-503): first contact and the treaty, what each kind of unit may
// do there, speaking with the chief, and demanding tribute. Missions, trade, learning and
// attack have their own modules and plug in here.
import { adjustTribalAlarm, meetTribe, settlementAlarm, tribalAlarm, type AlarmEvent } from './alarm';
import { addGoods, amountOf } from './cargo';
import { coloniesOf } from './colony';
import { GOOD_IDS, type GoodId } from './data/goods';
import { NATIVES, TRIBES, type TribeId } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { VILLAGE, type VillageAction } from './data/village';
import { DIFFICULTIES } from './data/yields';
import { revealAround } from './explore';
import { chiefProduct, wantedGoods } from './native-economy';
import { checkOffer, enterHostile, openTrade, type NativeTradeErrorCode, type NativeTradeEvent } from './native-trade';
import { warehouseCapacity } from './pioneer';
import { createRng } from './rng';
import { militaryStrength } from './royal';
import type { ProfessionId } from './data/professions';
import { liveAmongNatives, settlementSkill, type LearningEvent } from './learning';
import { attackNatives, type NativeWarEvent } from './native-war';
import { denounceHeresy, establishMission, incite, incitePrice, inciteRefusal, type MissionEvent } from './missions';
import { nativeDistance, tribeMight } from './settlements';
import type { Colony, GameState, Player, PlayerId, Settlement, Unit } from './state';

export type VillageEvent =
  | AlarmEvent
  | LearningEvent
  | NativeWarEvent
  | NativeTradeEvent
  | MissionEvent
  /** A tribe newly met proposes peace; a human power must answer. */
  | { readonly type: 'treatyOffered'; readonly tribe: TribeId; readonly player: PlayerId; readonly settlements: number }
  | { readonly type: 'treatyAnswered'; readonly tribe: TribeId; readonly player: PlayerId; readonly accepted: boolean }
  | { readonly type: 'chiefSpoke'; readonly unitId: string; readonly settlementId: string; readonly outcome: 'killed' | 'nothing' | 'promotion' | 'tales' | 'gift'; readonly gold: number; readonly wants: readonly GoodId[]; readonly skill: ProfessionId }
  | { readonly type: 'tributeDemanded'; readonly unitId: string; readonly settlementId: string; readonly outcome: 'laughed' | 'refused' | 'poor' | 'paid'; readonly good: GoodId | null; readonly amount: number; readonly colonyId: string | null };

export type VillageErrorCode = NativeTradeErrorCode | 'noTarget' | 'cannotAfford' | 'noSuchSettlement' | 'notAdjacent' | 'noMovesLeft' | 'notAllowed' | 'shipsUnknown' | 'shipsUnwelcome' | 'noTreatyPending';
export type VillageCheck = { readonly ok: true } | { readonly ok: false; readonly code: VillageErrorCode; readonly message: string };
const no = (code: VillageErrorCode, message: string): VillageCheck => ({ ok: false, code, message });

const playerOf = (state: GameState, id: PlayerId): Player | undefined => state.players.find((p) => p.id === id);
const level = (state: GameState, player: Player | undefined): number => (player?.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : 0);
const atPeace = (state: GameState, tribe: TribeId, playerId: PlayerId): boolean => state.tribes[tribe]?.peace.includes(playerId) ?? false;
const hasMet = (state: GameState, tribe: TribeId, playerId: PlayerId): boolean => state.tribes[tribe]?.met.includes(playerId) ?? false;

// --- first contact ---------------------------------------------------------------------------------

/**
 * A power's land unit or colony at (x, y) is seen by every settlement beside it. A tribe meeting
 * the power for the first time offers a treaty: a computer power accepts at once, a human is asked.
 */
export function contactAt(state: GameState, playerId: PlayerId, x: number, y: number, events: VillageEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player) return state;
  let next = state;
  for (const s of Object.values(state.settlements)) {
    if (Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) <= 1) next = greetTribe(next, s.tribe, playerId, events);
  }
  return next;
}

/** A tribe and a power meet (if they have not already): the tribe proposes a treaty. */
export function greetTribe(state: GameState, tribe: TribeId, playerId: PlayerId, events: VillageEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || hasMet(state, tribe, playerId) || !state.tribes[tribe]) return state;
  let next = meetTribe(state, tribe, playerId, events);
  const count = Object.values(next.settlements).filter((v) => v.tribe === tribe).length;
  events.push({ type: 'treatyOffered', tribe, player: playerId, settlements: count });
  if (player.kind === 'ai') next = answerTreaty(next, playerId, tribe, true, events);
  else next = { ...next, players: next.players.map((p) => (p.id === playerId ? { ...p, pendingTreaties: [...p.pendingTreaties, tribe] } : p)) };
  return next;
}

export function checkAnswerTreaty(state: GameState, playerId: PlayerId, tribe: TribeId): VillageCheck {
  return playerOf(state, playerId)?.pendingTreaties.includes(tribe) ? { ok: true } : no('noTreatyPending', 'that tribe has offered no treaty');
}

/** Accepting brings peace; refusing turns the tribe against the power at once. */
export function answerTreaty(state: GameState, playerId: PlayerId, tribe: TribeId, accept: boolean, events: VillageEvent[]): GameState {
  let next: GameState = { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, pendingTreaties: p.pendingTreaties.filter((t) => t !== tribe) } : p)) };
  const record = next.tribes[tribe];
  if (!record) return next;
  events.push({ type: 'treatyAnswered', tribe, player: playerId, accepted: accept });
  if (accept) return { ...next, tribes: { ...next.tribes, [tribe]: { ...record, peace: record.peace.includes(playerId) ? record.peace : [...record.peace, playerId] } } };
  const rng = createRng(next.rng);
  next = adjustTribalAlarm(next, tribe, playerId, VILLAGE.treatyRefusedAlarm, rng, events);
  return { ...next, rng: rng.state() };
}

// --- the menu ----------------------------------------------------------------------------------------

/** How the settlement receives a visitor of this power: the line at the head of the menu. */
export function settlementMood(state: GameState, settlement: Settlement, playerId: PlayerId): 'happy' | 'wary' | 'sullen' | 'war' {
  const t = tribalAlarm(state, settlement.tribe, playerId);
  if (t >= NATIVES.alarmLevels[2]) return 'war';
  if (t >= NATIVES.alarmLevels[1]) return 'sullen';
  return t >= NATIVES.alarmLevels[0] || settlementAlarm(settlement, playerId) >= NATIVES.settlementHostile ? 'wary' : 'happy';
}

/** Is a ship of this power turned away before anything can be asked? */
export function shipRefusal(state: GameState, settlement: Settlement, playerId: PlayerId): VillageCheck {
  if (!hasMet(state, settlement.tribe, playerId)) return no('shipsUnknown', 'these people have never met us on land and will not deal with a ship');
  if (tribalAlarm(state, settlement.tribe, playerId) >= NATIVES.alarmLevels[2] || settlementAlarm(settlement, playerId) >= NATIVES.settlementWary) {
    return no('shipsUnwelcome', 'our ships are not welcome here');
  }
  return { ok: true };
}

/** What this unit may do at this settlement, in menu order. Empty for a ship that is turned away. */
export function villageActions(state: GameState, unit: Unit, settlement: Settlement): VillageAction[] {
  const type = UNIT_TYPES[unit.type];
  const ship = type.domain === 'sea';
  if (ship && !shipRefusal(state, settlement, unit.owner).ok) return [];
  const out: VillageAction[] = [];
  const carrier = ship || unit.type === 'wagonTrain';
  if (carrier) out.push(tribalAlarm(state, settlement.tribe, unit.owner) < NATIVES.alarmLevels[2] ? 'trade' : 'enterHostile');
  if (unit.type === 'scout') out.push('speakWithChief');
  if (atPeace(state, settlement.tribe, unit.owner)) {
    if (unit.type === 'missionary') {
      if (!settlement.mission) out.push('establishMission');
      else if (settlement.mission.owner !== unit.owner) out.push('denounce');
      out.push('incite');
    } else if (!ship) {
      const learner = type.colonistRole && type.attack < 2 && unit.type !== 'scout' && unit.profession !== 'indianConvert';
      if (learner) out.push('liveAmong');
      if (type.attack > 0) out.push('demandTribute');
    }
  }
  if (!ship && type.attack > 0) out.push('attack');
  return out;
}

/** Every action on the menu can now be carried out. */
const BUILT: readonly VillageAction[] = ['speakWithChief', 'demandTribute', 'establishMission', 'denounce', 'incite', 'trade', 'enterHostile', 'attack', 'liveAmong'];

export function checkVillageAction(state: GameState, unit: Unit, settlementId: string, action: VillageAction, target?: PlayerId, good?: GoodId): VillageCheck {
  const settlement = state.settlements[settlementId];
  if (!settlement) return no('noSuchSettlement', 'there is no such settlement');
  if (unit.voyage !== null || Math.max(Math.abs(unit.x - settlement.x), Math.abs(unit.y - settlement.y)) !== 1) return no('notAdjacent', 'the unit must be beside the settlement');
  if (unit.movesLeft <= 0) return no('noMovesLeft', `unit ${unit.id} has no moves left`);
  if (UNIT_TYPES[unit.type].domain === 'sea') {
    const welcome = shipRefusal(state, settlement, unit.owner);
    if (!welcome.ok) return welcome;
  }
  if (!villageActions(state, unit, settlement).includes(action)) return no('notAllowed', 'this unit cannot do that here');
  if (action === 'trade' || action === 'enterHostile') {
    const laden = GOOD_IDS.some((g) => amountOf(unit.cargo, g) > 0);
    if (good !== undefined || laden) {
      const offer = checkOffer(state, unit, settlement, good);
      if (!offer.ok) return offer;
    }
  }
  if (action === 'incite') {
    const why = inciteRefusal(state, unit, settlement, target);
    if (why === 'noTarget') return no('noTarget', 'name the power they are to be set against');
    if (why === 'notMet') return no('notAllowed', 'these people have never met that power');
    if (why === 'alreadyAtWar') return no('notAllowed', 'they are already at war with that power');
    if (why === 'cannotAfford') return no('cannotAfford', `they ask ${incitePrice(state, unit, settlement)} gold for it`);
  }
  return BUILT.includes(action) ? { ok: true } : no('notAllowed', 'this unit cannot do that here');
}

const spend = (unit: Unit): Unit => ({ ...unit, movesLeft: 0 });

// --- the chief ---------------------------------------------------------------------------------------

/**
 * A scout asks to speak with the chief. An angry tribe may kill the scout (never with Coronado);
 * the first scout to be well received at a settlement is promoted, told of the lands around, or
 * given gold. The chief also says what his people want.
 */
export function speakWithChief(state: GameState, unit: Unit, settlement: Settlement, events: VillageEvent[]): GameState {
  const player = playerOf(state, unit.owner) as Player;
  const rng = createRng(state.rng);
  const d = level(state, player);
  const t = tribalAlarm(state, settlement.tribe, unit.owner);
  const seasoned = unit.profession === 'seasonedScout';
  const wants = wantedGoods(state, settlement);
  const roll = rng.int(0, VILLAGE.chiefRoll[seasoned ? 1 : 0]);
  let killed = t >= NATIVES.alarmLevels[2] || (t >= VILLAGE.chiefRiskFrom && Math.trunc(t / VILLAGE.chiefRiskDivisor) >= roll);
  if (!killed && settlement.tribe === VILLAGE.wariestTribe) killed = rng.int(0, (VILLAGE.wariestOdds - d) << (seasoned ? 1 : 0)) === 0;
  const done = (next: GameState, outcome: Extract<VillageEvent, { type: 'chiefSpoke' }>['outcome'], gold = 0): GameState => {
    events.push({ type: 'chiefSpoke', unitId: unit.id, settlementId: settlement.id, outcome, gold, wants, skill: settlementSkill(state, settlement) });
    return { ...next, rng: rng.state() };
  };
  const stay: GameState = { ...state, units: { ...state.units, [unit.id]: spend(unit) } };
  if (killed) {
    if (player.fathers.includes('franciscoCoronado')) return done(stay, 'nothing');
    const { [unit.id]: _dead, ...units } = state.units;
    return done({ ...state, units }, 'killed');
  }
  if (roll <= t || settlement.scouted.length > 0) return done(stay, 'nothing');

  const visited: GameState = { ...stay, settlements: { ...stay.settlements, [settlement.id]: { ...settlement, scouted: [unit.owner] } } };
  let favour = rng.pick(VILLAGE.chiefFavours);
  if (favour === 'promotion' && seasoned) favour = 'tales';
  if (favour === 'promotion') {
    return done({ ...visited, units: { ...visited.units, [unit.id]: { ...spend(unit), profession: 'seasonedScout' } } }, 'promotion');
  }
  if (favour === 'tales') {
    const index = state.players.indexOf(player);
    return done({ ...visited, map: revealAround(visited.map, index, unit.x, unit.y, VILLAGE.talesRadius).map }, 'tales');
  }
  const die = VILLAGE.giftDie - d;
  const gold = (rng.int(1, die) + rng.int(1, die) + rng.int(1, die)) * rng.int(1, VILLAGE.giftTimes) * VILLAGE.giftScale * (TRIBES[settlement.tribe].tech + 1);
  return done({ ...visited, players: visited.players.map((p) => (p.id === player.id ? { ...p, gold: p.gold + gold } : p)) }, 'gift', gold);
}

// --- tribute -----------------------------------------------------------------------------------------

function nearestColony(state: GameState, playerId: PlayerId, x: number, y: number): Colony | null {
  let best: Colony | null = null;
  let bestD = Infinity;
  for (const c of coloniesOf(state, playerId)) {
    const d = nativeDistance(c.x, c.y, x, y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * Soldiers demand tribute. The tribe weighs the power's strength against its own and its anger:
 * it may laugh, refuse, plead poverty, or (once per settlement) send goods to the power's nearest colony.
 */
export function demandTribute(state: GameState, unit: Unit, settlement: Settlement, events: VillageEvent[]): GameState {
  const player = playerOf(state, unit.owner) as Player;
  const rng = createRng(state.rng);
  const t = tribalAlarm(state, settlement.tribe, unit.owner);
  const ours = militaryStrength(state, unit.owner);
  let power = ours + (ours >> 1);
  if (player.nation === 'spain') power += power >> 1;
  if (player.fathers.includes('hernanCortes')) power += power >> 1;
  const theirs = tribeMight(state, settlement.tribe);
  const resistance = (theirs + (theirs >> 1)) * 2 + (t >> 1);
  const colony = nearestColony(state, unit.owner, settlement.x, settlement.y);
  const success = rng.int(0, resistance) < rng.int(0, power) && colony !== null;

  let outcome: Extract<VillageEvent, { type: 'tributeDemanded' }>['outcome'];
  if ((!success && power <= resistance) || t >= NATIVES.alarmLevels[2]) outcome = 'laughed';
  else if (!success && t >= VILLAGE.tributeRefusedFrom) outcome = 'refused';
  else if (settlement.tributePaid || !success) outcome = 'poor';
  else outcome = 'paid';

  let next: GameState = { ...state, units: { ...state.units, [unit.id]: spend(unit) } };
  let good: GoodId | null = null;
  let amount = 0;
  if (outcome === 'paid' && colony) {
    const product = chiefProduct(state, settlement);
    good = product?.good ?? 'food';
    const room = warehouseCapacity(colony) - amountOf(colony.goods, good);
    amount = Math.max(VILLAGE.tributeLeast, Math.min(room, VILLAGE.tributePerSupply * (product?.supply ?? 0) + VILLAGE.tributeBase, VILLAGE.tributeMost));
    next = {
      ...next,
      settlements: { ...next.settlements, [settlement.id]: { ...settlement, tributePaid: true } },
      colonies: { ...next.colonies, [colony.id]: { ...colony, goods: addGoods(colony.goods, good, amount) } },
    };
  }
  events.push({ type: 'tributeDemanded', unitId: unit.id, settlementId: settlement.id, outcome, good, amount, colonyId: outcome === 'paid' ? (colony?.id ?? null) : null });
  if (outcome !== 'poor') {
    const anger = (player.kind === 'human' ? level(state, player) + 1 : 1) * (outcome === 'paid' ? 2 : 1);
    next = adjustTribalAlarm(next, settlement.tribe, unit.owner, anger, rng, events);
  }
  return { ...next, rng: rng.state() };
}

export function villageAction(state: GameState, unit: Unit, settlementId: string, action: VillageAction, events: VillageEvent[], target?: PlayerId, good?: GoodId): GameState {
  const settlement = state.settlements[settlementId] as Settlement;
  switch (action) {
    case 'speakWithChief': return speakWithChief(state, unit, settlement, events);
    case 'establishMission': return establishMission(state, unit, settlement, events);
    case 'denounce': return denounceHeresy(state, unit, settlement, events);
    case 'incite': return incite(state, unit, settlement, target as PlayerId, events);
    case 'trade': return openTrade(state, unit, settlement, good, events as NativeTradeEvent[]);
    case 'enterHostile': return enterHostile(state, unit, settlement, good, events as NativeTradeEvent[]);
    case 'liveAmong': return liveAmongNatives(state, unit, settlement, events as LearningEvent[]);
    case 'attack': return attackNatives(state, unit, settlement.x - unit.x, settlement.y - unit.y, events as NativeWarEvent[]);
    default: return demandTribute(state, unit, settlement, events);
  }
}

export { tribeMight };
