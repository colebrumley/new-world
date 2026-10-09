// Missions (R-504): founding one, denouncing a rival's, inciting a tribe against another power,
// and how converts come and go. The quiet per-turn work of a mission is in alarm.ts.
import { adjustTribalAlarm, alarmSource, attitude, tribalAlarm, type AlarmEvent } from './alarm';
import { MISSIONS } from './data/missions';
import { alarmLevel, NATIVES, TRIBES, type TribeId } from './data/tribes';
import { createRng, type Rng } from './rng';
import { tribeMight } from './settlements';
import type { GameState, Player, PlayerId, Settlement, Unit } from './state';

export type MissionEvent =
  | AlarmEvent
  | { readonly type: 'missionFounded'; readonly settlementId: string; readonly player: PlayerId; readonly expert: boolean; readonly alarm: number }
  /** A missionary denounced the mission of `incumbent`; the council sided with one of them. */
  | { readonly type: 'heresyDenounced'; readonly settlementId: string; readonly player: PlayerId; readonly incumbent: PlayerId; readonly success: boolean }
  | { readonly type: 'tribeIncited'; readonly tribe: TribeId; readonly player: PlayerId; readonly target: PlayerId; readonly price: number }
  | { readonly type: 'convertJoined'; readonly settlementId: string; readonly player: PlayerId; readonly unitId: string; readonly forced: boolean }
  | { readonly type: 'convertLeft'; readonly unitId: string; readonly player: PlayerId };

/** Anything mission events can be pushed onto. */
export interface MissionSink {
  push(...events: MissionEvent[]): unknown;
}

const playerOf = (state: GameState, id: PlayerId): Player | undefined => state.players.find((p) => p.id === id);
const remove = (state: GameState, unitId: string): GameState => {
  const { [unitId]: _gone, ...units } = state.units;
  return { ...state, units };
};
const tribeSettlements = (state: GameState, tribe: TribeId): Settlement[] => Object.values(state.settlements).filter((s) => s.tribe === tribe);
const put = (state: GameState, s: Settlement): GameState => ({ ...state, settlements: { ...state.settlements, [s.id]: s } });

/** Is a mission founded by this unit an expert one? A Jesuit's is; so is anyone's once Brebeuf has joined. */
export function isExpertMissionary(state: GameState, unit: Unit): boolean {
  return unit.profession === 'jesuitMissionary' || (playerOf(state, unit.owner)?.fathers.includes('jeanDeBrebeuf') ?? false);
}

/** How a tribe's alarm changes when this power founds a mission here: welcome at first, resentment as missions multiply. */
export function missionAlarmChange(state: GameState, settlement: Settlement, playerId: PlayerId): number {
  const player = playerOf(state, playerId);
  let missions = tribeSettlements(state, settlement.tribe).filter((s) => s.mission?.owner === playerId).length;
  if (player?.fathers.includes('juanDeSepulveda')) missions *= 2;
  if (player?.fathers.includes('bartolomeDeLasCasas')) missions >>= 1;
  if (player?.fathers.includes('pocahontas')) missions >>= 1;
  if (player?.nation === 'france') missions >>= 1;
  let delta = MISSIONS.perMission * missions - (MISSIONS.welcome[attitude(state, settlement.tribe, playerId)] as number);
  if (settlement.capital) delta += delta < 0 ? -MISSIONS.capitalSwing : MISSIONS.capitalSwing;
  return delta;
}

/** The missionary settles in for good. It always succeeds. */
export function establishMission(state: GameState, unit: Unit, settlement: Settlement, events: MissionSink): GameState {
  const expert = isExpertMissionary(state, unit);
  const delta = missionAlarmChange(state, settlement, unit.owner);
  let next = put(remove(state, unit.id), { ...settlement, mission: { owner: unit.owner, expert } });
  events.push({ type: 'missionFounded', settlementId: settlement.id, player: unit.owner, expert, alarm: delta });
  const rng = createRng(next.rng);
  next = adjustTribalAlarm(next, settlement.tribe, unit.owner, delta, rng, events);
  return { ...next, rng: rng.state() };
}

/** How the council weighs the two faiths: the incumbent's side and the challenger's. */
export function heresyWeights(state: GameState, settlement: Settlement, challenger: PlayerId): { incumbent: number; challenger: number } {
  const holder = settlement.mission?.owner ?? '';
  let x = 0;
  let y = 0;
  for (const s of tribeSettlements(state, settlement.tribe)) {
    const source = alarmSource(state, s);
    if (source?.owner === holder) x += source.amount;
    if (source?.owner === challenger) y += source.amount;
    if (s.mission) x += s.population * (s.mission.expert ? 2 : 1) * (s.capital ? 2 : 1);
  }
  x += tribalAlarm(state, settlement.tribe, holder) * (settlement.capital ? MISSIONS.capitalStanding : 1);
  y += settlement.capital ? 0 : tribalAlarm(state, settlement.tribe, challenger) >> 1;
  return { incumbent: x, challenger: y };
}

/**
 * A missionary denounces another power's mission before the tribal council. Whichever way it
 * goes the denouncer is used up; the winner gains standing with the tribe and the loser loses it.
 */
export function denounceHeresy(state: GameState, unit: Unit, settlement: Settlement, events: MissionSink): GameState {
  const mission = settlement.mission as NonNullable<Settlement['mission']>;
  const rng = createRng(state.rng);
  let { incumbent: x, challenger: y } = heresyWeights(state, settlement, unit.owner);
  if (settlement.capital) {
    x += rng.int(1, MISSIONS.capitalThrow);
    y += rng.int(1, MISSIONS.capitalThrow);
  }
  if (mission.expert) y *= 2;
  const success = x + y > 0 && rng.int(1, x + y) <= x;
  const scale = settlement.capital ? 2 : 1;
  const mine = (alarmLevel(Math.min(NATIVES.alarmMax, y)) + 1) * scale * (mission.expert ? 2 : 1);
  const theirs = (alarmLevel(Math.min(NATIVES.alarmMax, x)) + 1) * scale;
  let next = remove(state, unit.id);
  if (success) next = put(next, { ...settlement, mission: { owner: unit.owner, expert: false } });
  events.push({ type: 'heresyDenounced', settlementId: settlement.id, player: unit.owner, incumbent: mission.owner, success });
  next = adjustTribalAlarm(next, settlement.tribe, unit.owner, success ? -mine : mine, rng, events);
  next = adjustTribalAlarm(next, settlement.tribe, mission.owner, success ? theirs : -theirs, rng, events);
  return { ...next, rng: rng.state() };
}

/** What the tribe asks for taking the warpath against another power. */
export function incitePrice(state: GameState, unit: Unit, settlement: Settlement): number {
  const tribe = state.tribes[settlement.tribe];
  const player = playerOf(state, unit.owner);
  const all = tribeSettlements(state, settlement.tribe);
  const strength = MISSIONS.incitePerSettlement * all.length
    + MISSIONS.incitePerMight * Math.floor(tribeMight(state, settlement.tribe) / MISSIONS.inciteMightDivisor)
    + MISSIONS.incitePerMusket * (tribe?.muskets ?? 0)
    + MISSIONS.incitePerHerd * (tribe?.horses ?? 0);
  let price = strength * (tribalAlarm(state, settlement.tribe, unit.owner) + MISSIONS.inciteAlarmBase);
  if (player?.nation === 'france') price = Math.trunc((price * MISSIONS.inciteFrenchFactor[0]) / MISSIONS.inciteFrenchFactor[1]);
  for (const s of all) {
    if (s.mission?.owner !== unit.owner) continue;
    price -= (s.mission.expert ? MISSIONS.inciteExpertMissionDiscount : MISSIONS.inciteMissionDiscount) * (s.capital ? 2 : 1);
  }
  if (unit.profession === 'jesuitMissionary') price -= MISSIONS.inciteJesuitDiscount;
  if (settlement.capital) price -= MISSIONS.inciteCapitalDiscount;
  return Math.max(MISSIONS.inciteMinimum, price);
}

export type InciteRefusal = 'noTarget' | 'notMet' | 'alreadyAtWar' | 'cannotAfford';

/** Why this tribe cannot be set on that power just now, or null if it can. */
export function inciteRefusal(state: GameState, unit: Unit, settlement: Settlement, target: PlayerId | undefined): InciteRefusal | null {
  const victim = target === undefined ? undefined : playerOf(state, target);
  if (!victim || victim.id === unit.owner || victim.withdrawn) return 'noTarget';
  if (!state.tribes[settlement.tribe]?.met.includes(victim.id)) return 'notMet';
  if (tribalAlarm(state, settlement.tribe, victim.id) >= NATIVES.alarmLevels[2]) return 'alreadyAtWar';
  return (playerOf(state, unit.owner)?.gold ?? 0) >= incitePrice(state, unit, settlement) ? null : 'cannotAfford';
}

/** Gold changes hands and the tribe turns on the target. The missionary stays. */
export function incite(state: GameState, unit: Unit, settlement: Settlement, target: PlayerId, events: MissionSink): GameState {
  const price = incitePrice(state, unit, settlement);
  let next: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === unit.owner ? { ...p, gold: p.gold - price } : p)),
    units: { ...state.units, [unit.id]: { ...unit, movesLeft: 0 } },
  };
  events.push({ type: 'tribeIncited', tribe: settlement.tribe, player: unit.owner, target, price });
  const rng = createRng(next.rng);
  next = adjustTribalAlarm(next, settlement.tribe, target, MISSIONS.inciteAlarm, rng, events);
  return { ...next, rng: rng.state() };
}

// --- converts ----------------------------------------------------------------------------------------

function addConvert(state: GameState, playerId: PlayerId, x: number, y: number): { state: GameState; id: string } {
  const id = `u${state.nextId}`;
  const convert: Unit = {
    id, owner: playerId, type: 'colonist', profession: 'indianConvert', x, y, movesLeft: 0, orders: 'none', destination: null,
    aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
  };
  return { state: { ...state, nextId: state.nextId + 1, units: { ...state.units, [id]: convert } }, id };
}

/**
 * A friendly visit from a settlement that holds this power's mission may bring a convert to the
 * colony visited (the only peaceful way converts come).
 */
export function visitConvert(state: GameState, settlement: Settlement, playerId: PlayerId, x: number, y: number, rng: Rng, events: MissionSink): GameState {
  const mission = settlement.mission;
  if (!mission || mission.owner !== playerId) return state;
  const need = (TRIBES[settlement.tribe].tech + MISSIONS.convertBase) * (mission.expert ? 2 : 1);
  if (rng.int(0, MISSIONS.convertDie - 1) >= need) return state;
  const made = addConvert(state, playerId, x, y);
  events.push({ type: 'convertJoined', settlementId: settlement.id, player: playerId, unitId: made.id, forced: false });
  return made.state;
}

/** The threshold, out of 13, for a convert to follow the victor of an attack on a settlement holding the victor's mission. */
export function forcedConvertOdds(state: GameState, settlement: Settlement, playerId: PlayerId): number {
  const mission = settlement.mission;
  const player = playerOf(state, playerId);
  if (!mission || mission.owner !== playerId || !player) return 0;
  let odds = mission.expert ? MISSIONS.forcedExpert : MISSIONS.forcedBase;
  if (player.nation === 'spain') odds += MISSIONS.forcedBonus;
  if (player.fathers.includes('juanDeSepulveda')) odds += MISSIONS.forcedBonus;
  if (player.fathers.includes('bartolomeDeLasCasas')) odds -= MISSIONS.forcedBonus;
  return Math.max(0, odds);
}

export function forcedConvert(state: GameState, settlement: Settlement, playerId: PlayerId, x: number, y: number, rng: Rng, events: MissionSink): GameState {
  if (rng.int(0, MISSIONS.forcedDie - 1) >= forcedConvertOdds(state, settlement, playerId)) return state;
  const made = addConvert(state, playerId, x, y);
  events.push({ type: 'convertJoined', settlementId: settlement.id, player: playerId, unitId: made.id, forced: true });
  return made.state;
}

/** Converts kept standing about outside a colony lose heart and go home. Run once per turn for a power. */
export function convertsDrift(state: GameState, playerId: PlayerId, events: MissionSink): GameState {
  let next = state;
  for (const u of Object.values(state.units)) {
    if (u.owner !== playerId || u.profession !== 'indianConvert' || u.voyage !== null) continue;
    if (u.workTurns + 1 >= MISSIONS.convertPatience) {
      next = remove(next, u.id);
      events.push({ type: 'convertLeft', unitId: u.id, player: playerId });
    } else next = { ...next, units: { ...next.units, [u.id]: { ...u, workTurns: u.workTurns + 1 } } };
  }
  return next;
}

/** Las Casas joins the Congress: every convert, in a colony or out, becomes a free colonist. */
export function freeConverts(state: GameState, playerId: PlayerId): GameState {
  const units = Object.fromEntries(Object.values(state.units).map((u) => [u.id, u.owner === playerId && u.profession === 'indianConvert' ? { ...u, profession: 'freeColonist' as const, workTurns: 0 } : u]));
  const colonies = Object.fromEntries(Object.values(state.colonies).map((c) => [
    c.id,
    c.owner === playerId && c.colonists.some((p) => p.profession === 'indianConvert')
      ? { ...c, colonists: c.colonists.map((p) => (p.profession === 'indianConvert' ? { ...p, profession: 'freeColonist' as const } : p)) }
      : c,
  ]));
  return { ...state, units, colonies };
}
