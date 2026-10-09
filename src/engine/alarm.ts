// Native alarm (R-502). Two layers: a tribe's alarm at each European power (0..100, in four
// levels) and each settlement's own alarm. Colonies and soldiers nearby press on settlements;
// time, missions and kindness (banked as goodwill) cool the tribe. Rules: docs/RULES.md "Alarm".
import { ALARM, BUILDING_ALARM, MISSION_ALARM } from './data/alarm';
import { alarmLevel, NATIVES, settlementPopulation, TRIBES, type TribeId } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { createRng, type Rng } from './rng';
import { raiseBrave } from './braves';
import { braveId, nativeDistance } from './settlements';
import type { GameState, Player, PlayerId, Settlement, TribeState } from './state';

export type AlarmEvent =
  /** A tribe's attitude toward a power moved to another level (0 content .. 3 hostile). */
  | { readonly type: 'attitudeChanged'; readonly tribe: TribeId; readonly player: PlayerId; readonly from: number; readonly to: number }
  | { readonly type: 'missionsBurned'; readonly tribe: TribeId; readonly player: PlayerId; readonly settlements: readonly string[] }
  | { readonly type: 'tribeMet'; readonly tribe: TribeId; readonly player: PlayerId }
  | { readonly type: 'settlementGrew'; readonly settlementId: string; readonly population: number }
  | { readonly type: 'braveRaised'; readonly settlementId: string; readonly unitId: string };

/** Anything alarm events can be pushed onto (an array of a wider event type will do). */
export interface AlarmSink {
  push(...events: AlarmEvent[]): unknown;
}

const playerOf = (state: GameState, id: PlayerId): Player | undefined => state.players.find((p) => p.id === id);
const levelFor = (state: GameState, player: Player | undefined): number => (player?.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : ALARM.aiLevel);
const scale = (n: number, [num, den]: readonly [number, number]): number => Math.trunc((n * num) / den);

export const tribalAlarm = (state: GameState, tribe: TribeId, playerId: PlayerId): number => state.tribes[tribe]?.alarm[playerId] ?? 0;
export const settlementAlarm = (settlement: Settlement, playerId: PlayerId): number => settlement.alarm[playerId] ?? 0;
/** A tribe's attitude level toward a power: 0 content, 1 uneasy, 2 restless, 3 hostile. */
export const attitude = (state: GameState, tribe: TribeId, playerId: PlayerId): 0 | 1 | 2 | 3 => alarmLevel(tribalAlarm(state, tribe, playerId));
export const isHostile = (settlement: Settlement, playerId: PlayerId): boolean => settlementAlarm(settlement, playerId) >= NATIVES.settlementHostile;

function withTribe(state: GameState, tribe: TribeId, change: (t: TribeState) => TribeState): GameState {
  const record = state.tribes[tribe];
  return record ? { ...state, tribes: { ...state.tribes, [tribe]: change(record) } } : state;
}

/**
 * Change a tribe's alarm at a power. Increases are halved for the French and again with Pocahontas.
 * A fall that crosses a step of five calms every settlement of the tribe; reaching the top may
 * cost the power its missions there.
 */
export function adjustTribalAlarm(state: GameState, tribe: TribeId, playerId: PlayerId, delta: number, rng: Rng, events: AlarmSink): GameState {
  const record = state.tribes[tribe];
  const player = playerOf(state, playerId);
  if (!record || !player) return state;
  let change = delta;
  if (change > 0 && player.nation === 'france') change >>= 1;
  if (change > 0 && player.fathers.includes('pocahontas')) change >>= 1;
  const old = Math.min(NATIVES.alarmMax, Math.max(0, record.alarm[playerId] ?? 0));
  const now = Math.min(NATIVES.alarmMax, Math.max(0, old + change));
  let next = withTribe(state, tribe, (t) => ({ ...t, alarm: { ...t.alarm, [playerId]: now } }));
  if (alarmLevel(old) !== alarmLevel(now)) events.push({ type: 'attitudeChanged', tribe, player: playerId, from: alarmLevel(old), to: alarmLevel(now) });

  if (now >= NATIVES.alarmMax && change > 0) {
    if (rng.int(0, ALARM.burnOdds - 1) <= levelFor(state, player) + 1) {
      const burned = Object.values(next.settlements).filter((s) => s.tribe === tribe && s.mission?.owner === playerId);
      if (burned.length > 0) {
        const settlements = { ...next.settlements };
        for (const s of burned) settlements[s.id] = { ...s, mission: null };
        next = { ...next, settlements };
        events.push({ type: 'missionsBurned', tribe, player: playerId, settlements: burned.map((s) => s.id) });
      }
    }
  } else if (change < 0 && Math.floor(old / ALARM.coolingStep) !== Math.floor(Math.min(now, NATIVES.alarmMax - 1) / ALARM.coolingStep)) {
    const cap = ALARM.cooledCap[alarmLevel(now) >> 1] as number;
    const settlements = { ...next.settlements };
    let any = false;
    for (const s of Object.values(next.settlements)) {
      if (s.tribe !== tribe || (s.alarm[playerId] ?? 0) <= cap) continue;
      settlements[s.id] = { ...s, alarm: { ...s.alarm, [playerId]: cap } };
      any = true;
    }
    if (any) next = { ...next, settlements };
  }
  return next;
}

/** A tribe and a power come face to face for the first time: whatever the tribe had heard, it starts no worse than wary. */
export function meetTribe(state: GameState, tribe: TribeId, playerId: PlayerId, events: AlarmSink): GameState {
  const record = state.tribes[tribe];
  if (!record || record.met.includes(playerId)) return state;
  events.push({ type: 'tribeMet', tribe, player: playerId });
  return withTribe(state, tribe, (t) => ({ ...t, met: [...t.met, playerId], alarm: { ...t.alarm, [playerId]: Math.min(t.alarm[playerId] ?? 0, NATIVES.contactAlarmCap) } }));
}

/** Armed strength each power keeps around a settlement: units on the 20 nearest squares, discounted inside colonies and at the edge. */
export function militaryPresence(state: GameState, settlement: Settlement): Record<PlayerId, number> {
  const colonies = new Set(Object.values(state.colonies).map((c) => `${c.x},${c.y}`));
  const squares = new Map<string, Record<PlayerId, number>>();
  for (const u of Object.values(state.units)) {
    if (u.voyage !== null || u.aboard !== null) continue;
    const dx = Math.abs(u.x - settlement.x);
    const dy = Math.abs(u.y - settlement.y);
    if (dx > 2 || dy > 2 || (dx === 2 && dy === 2) || (dx === 0 && dy === 0)) continue;
    const type = UNIT_TYPES[u.type];
    if (type.domain !== 'land' || type.attack <= ALARM.militaryAttackOver || !playerOf(state, u.owner)) continue;
    const key = `${u.x},${u.y}`;
    const here = squares.get(key) ?? {};
    here[u.owner] = (here[u.owner] ?? 0) + type.attack;
    squares.set(key, here);
  }
  const total: Record<PlayerId, number> = {};
  for (const [key, byOwner] of squares) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    const outer = Math.max(Math.abs(x - settlement.x), Math.abs(y - settlement.y)) > 1;
    for (const [owner, sum] of Object.entries(byOwner)) {
      let weight = sum;
      if (colonies.has(key)) weight >>= 1;
      if (outer) weight >>= 1;
      total[owner] = (total[owner] ?? 0) + weight;
    }
  }
  return total;
}

/**
 * The colony that alarms this settlement most, and by how much. Only that colony's owner is
 * charged this turn. Big colonies, many buildings and soldiers nearby all count; distance helps.
 */
export function alarmSource(state: GameState, settlement: Settlement): { owner: PlayerId; amount: number } | null {
  const military = militaryPresence(state, settlement);
  const tech = TRIBES[settlement.tribe].tech;
  let best: { owner: PlayerId; amount: number } | null = null;
  for (const colony of Object.values(state.colonies)) {
    const d = nativeDistance(settlement.x, settlement.y, colony.x, colony.y);
    if (d > ALARM.colonyRange) continue;
    const owner = playerOf(state, colony.owner);
    if (!owner) continue;
    const human = owner.kind === 'human';
    const pop = colony.colonists.length;
    const easy = Math.min(pop, ALARM.colonyEasyPopulation);
    const buildings = human ? scale(colony.buildings.length, BUILDING_ALARM[state.difficulty]) : colony.buildings.length;
    const weight = (human ? DIFFICULTIES.indexOf(state.difficulty) : 0) + ((buildings - ALARM.buildingsAllowed) >> ALARM.buildingsShift);
    let amount = Math.trunc(((2 * (pop - easy) + Math.min(pop >> 1, tech) + easy + weight) * 2 - d - 1) / (d + 4));
    amount += military[owner.id] ?? 0;
    if (owner.nation === 'france') amount >>= 1;
    if (owner.fathers.includes('pocahontas')) amount >>= 1;
    if (amount > 0 && (!best || amount > best.amount)) best = { owner: owner.id, amount };
  }
  if (!best || !settlement.mission) return best;
  const own = settlement.mission.owner === best.owner;
  const factor = own ? (settlement.mission.expert ? MISSION_ALARM.ownExpert : MISSION_ALARM.own) : settlement.mission.expert ? MISSION_ALARM.foreignExpert : MISSION_ALARM.foreign;
  const amount = scale(best.amount, factor);
  return amount > 0 ? { owner: best.owner, amount } : null;
}

/** Turn banked goodwill into movement of the tribal alarm, a point for each full unit either way. */
function settleGoodwill(state: GameState, tribe: TribeId, playerId: PlayerId, rng: Rng, events: AlarmSink): GameState {
  let next = state;
  for (let guard = 0; guard < 200; guard++) {
    const g = next.tribes[tribe]?.goodwill[playerId] ?? 0;
    if (g >= ALARM.goodwillPerPoint) {
      next = withTribe(next, tribe, (t) => ({ ...t, goodwill: { ...t.goodwill, [playerId]: g - ALARM.goodwillPerPoint } }));
      next = adjustTribalAlarm(next, tribe, playerId, -1, rng, events);
    } else if (g <= -ALARM.goodwillPerPoint) {
      next = withTribe(next, tribe, (t) => ({ ...t, goodwill: { ...t.goodwill, [playerId]: g + ALARM.goodwillPerPoint } }));
      next = adjustTribalAlarm(next, tribe, playerId, 1, rng, events);
    } else break;
  }
  return next;
}

const addGoodwill = (state: GameState, tribe: TribeId, playerId: PlayerId, amount: number): GameState =>
  withTribe(state, tribe, (t) => ({ ...t, goodwill: { ...t.goodwill, [playerId]: (t.goodwill[playerId] ?? 0) + amount } }));

/** One settlement's turn: it grows, tempers cool, the nearest big colony presses on it, and a mission soothes it. */
export function settlementTurn(state: GameState, settlementId: string, rng: Rng, events: AlarmSink): GameState {
  const start = state.settlements[settlementId];
  if (!start || !state.tribes[start.tribe]) return state;
  const tribe = start.tribe;
  let next = state;
  let settlement = start;
  const put = (s: Settlement): void => {
    settlement = s;
    next = { ...next, settlements: { ...next.settlements, [s.id]: s } };
  };

  // growth: a lost brave is replaced first, then the settlement fills up
  const braveMissing = !state.units[braveId(settlementId)];
  if (braveMissing || settlement.population < settlementPopulation(tribe, settlement.capital).max) {
    const growth = settlement.growth + settlement.population;
    if (growth < NATIVES.growthAt) put({ ...settlement, growth });
    else if (braveMissing) {
      put({ ...settlement, growth: 0 });
      next = raiseBrave(next, settlement, rng);
      events.push({ type: 'braveRaised', settlementId, unitId: braveId(settlementId) });
    } else {
      put({ ...settlement, growth: 0, population: settlement.population + 1 });
      events.push({ type: 'settlementGrew', settlementId, population: settlement.population });
    }
  }

  // tempers cool with time, faster the hotter they are; not once a war of independence has begun
  const declared = state.players.some((p) => p.atWar);
  if (!declared) {
    for (const playerId of state.tribes[tribe]?.met ?? []) {
      const l = attitude(next, tribe, playerId);
      let calmed = 0;
      for (let i = 0; i < l * l + 1; i++) if (rng.int(0, ALARM.coolingDie - 1 - l * l) === 0) calmed++;
      if (calmed > 0) next = addGoodwill(next, tribe, playerId, calmed);
    }
  }

  // the most alarming colony nearby
  const source = alarmSource(next, settlement);
  const shift = settlement.capital ? 1 : 0;
  if (source) {
    next = addGoodwill(next, tribe, source.owner, -(source.amount << shift));
    let rise = source.amount << shift;
    if (settlement.mission?.owner === source.owner) rise >>= 1;
    rise += Math.trunc(tribalAlarm(next, tribe, source.owner) / ALARM.tribalShare);
    put({ ...settlement, alarm: { ...settlement.alarm, [source.owner]: settlementAlarm(settlement, source.owner) + rise } });
  }

  // a mission does its quiet work
  const mission = settlement.mission;
  const missionary = mission ? playerOf(next, mission.owner) : undefined;
  if (mission && missionary) {
    let v = ALARM.missionGoodwill[mission.expert ? 1 : 0] << shift;
    if (missionary.fathers.includes('bartolomeDeLasCasas')) v *= 2;
    if (missionary.fathers.includes('juanDeSepulveda')) v >>= 1;
    next = addGoodwill(next, tribe, mission.owner, v);
    put({ ...settlement, alarm: { ...settlement.alarm, [mission.owner]: Math.max(0, settlementAlarm(settlement, mission.owner) - ALARM.missionCalm * v) } });
  }

  for (const p of state.players) next = settleGoodwill(next, tribe, p.id, rng, events);
  return next;
}

/** Every settlement takes its turn, in id order. */
export function nativesTurn(state: GameState, events: AlarmSink): GameState {
  const ids = Object.keys(state.settlements);
  if (ids.length === 0) return state;
  const rng = createRng(state.rng);
  let next = state;
  for (const id of ids) next = settlementTurn(next, id, rng, events);
  return { ...next, rng: rng.state() };
}
