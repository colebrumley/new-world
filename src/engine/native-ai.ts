// What braves do each turn (R-507). Each settlement's band wanders near home; when its tribe or
// settlement is hostile to a power it hunts that power's units and colonies and attacks them;
// otherwise, coming alongside a colony, it pays a call. Meeting a power for the first time
// brings the treaty offer. The fighting and the calls themselves are in native-war.ts.
import { isHostile, tribalAlarm, adjustTribalAlarm, type AlarmEvent, type AlarmSink } from './alarm';
import { braveTypeFor } from './braves';
import { NATIVE_AI as AI } from './data/native-ai';
import { NATIVE_WAR } from './data/native-war';
import { NATIVES, TRIBE_IDS, TRIBES, type TribeId } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { landStepCost } from './movement';
import { braveAttacks, braveVisits, type NativeWarEvent } from './native-war';
import { createRng, type Rng } from './rng';
import { homeOfBrave, settlementAt, tribeOfOwner } from './settlements';
import { colonyAt, MOVE_THIRDS, type GameState, type PlayerId, type Settlement, type Unit } from './state';
import { isWater } from './tile';
import { greetTribe, type VillageEvent } from './village';

export type NativeAiEvent =
  | AlarmEvent
  | NativeWarEvent
  | VillageEvent
  /** A tribe has thrown in its lot with the Crown against the rebels. */
  | { readonly type: 'tribeJoinedCrown'; readonly tribe: TribeId; readonly against: PlayerId };

const STEPS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;
const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const isBrave = (u: Unit): boolean => UNIT_TYPES[u.type].native === true;

/** Powers this brave is out to fight: those its tribe is at war pitch with, or its own settlement hates. */
function enemiesOf(state: GameState, home: Settlement): PlayerId[] {
  return state.players.filter((p) => !p.withdrawn && (tribalAlarm(state, home.tribe, p.id) >= NATIVES.alarmLevels[2] || isHostile(home, p.id))).map((p) => p.id);
}

/** Can a brave stand on this square? Land that is not mountain, with no settlement but its own, no colony, and nobody else's unit. */
function canEnter(state: GameState, brave: Unit, x: number, y: number): boolean {
  const tile = state.map.tiles[y * state.map.width + x];
  if (!tile || x <= 0 || y <= 0 || x >= state.map.width - 1 || y >= state.map.height - 1 || isWater(tile) || tile.relief === 'mountains') return false;
  if (colonyAt(state, x, y)) return false;
  const village = settlementAt(state, x, y);
  if (village && village.id !== homeOfBrave(state, brave.id)?.id) return false;
  return !Object.values(state.units).some((u) => u.x === x && u.y === y && u.id !== brave.id && u.aboard === null && u.voyage === null);
}

/** The nearest thing of an enemy's that a brave could attack: a land unit in the open or a colony. */
function nearestEnemy(state: GameState, brave: Unit, enemies: readonly PlayerId[]): { x: number; y: number; d: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  const consider = (x: number, y: number): void => {
    const d = far(brave.x, brave.y, x, y);
    if (d <= AI.warRange && (!best || d < best.d)) best = { x, y, d };
  };
  for (const c of Object.values(state.colonies)) if (enemies.includes(c.owner)) consider(c.x, c.y);
  for (const u of Object.values(state.units)) {
    if (!enemies.includes(u.owner) || u.voyage !== null || u.aboard !== null || UNIT_TYPES[u.type].domain !== 'land') continue;
    const tile = state.map.tiles[u.y * state.map.width + u.x];
    if (tile && !isWater(tile)) consider(u.x, u.y);
  }
  return best;
}

/** One step toward (or, failing that, not away from) a goal; null if hemmed in. */
function stepToward(state: GameState, brave: Unit, gx: number, gy: number, rng: Rng): readonly [number, number] | null {
  const here = far(brave.x, brave.y, gx, gy);
  const open = STEPS.filter(([dx, dy]) => canEnter(state, brave, brave.x + dx, brave.y + dy));
  const closer = open.filter(([dx, dy]) => far(brave.x + dx, brave.y + dy, gx, gy) < here);
  if (closer.length > 0) return rng.pick(closer);
  const level = open.filter(([dx, dy]) => far(brave.x + dx, brave.y + dy, gx, gy) === here);
  return level.length > 0 ? rng.pick(level) : null;
}

function move(state: GameState, brave: Unit, dx: number, dy: number): GameState {
  const cost = Math.max(1, landStepCost(state, brave.x, brave.y, brave.x + dx, brave.y + dy));
  return { ...state, units: { ...state.units, [brave.id]: { ...brave, x: brave.x + dx, y: brave.y + dy, movesLeft: Math.max(0, brave.movesLeft - cost) } } };
}

/** A brave standing in its own settlement takes up what arms and mounts the tribe has for it. */
function rearm(state: GameState, brave: Unit, home: Settlement, rng: Rng): GameState {
  if (brave.x !== home.x || brave.y !== home.y) return state;
  const tribe = state.tribes[home.tribe];
  if (!tribe) return state;
  const armed = brave.type === 'armedBrave' || brave.type === 'mountedWarrior';
  const mounted = brave.type === 'mountedBrave' || brave.type === 'mountedWarrior';
  const takesMuskets = !armed && tribe.muskets > 0;
  const takesHorses = !mounted && tribe.breeding >= NATIVE_WAR.mountBreeding;
  if (!takesMuskets && !takesHorses) return state;
  const type = braveTypeFor({ ...tribe, muskets: armed || takesMuskets ? 1 : 0, breeding: mounted || takesHorses ? NATIVE_WAR.mountBreeding : 0 }, NATIVE_WAR.mountBreeding);
  const human = state.players.some((p) => p.kind === 'human');
  const spent = takesMuskets && rng.int(0, human ? DIFFICULTIES.indexOf(state.difficulty) : 0) === 0 ? 1 : 0;
  return {
    ...state,
    units: { ...state.units, [brave.id]: { ...brave, type } },
    tribes: { ...state.tribes, [home.tribe]: { ...tribe, muskets: tribe.muskets - spent, breeding: tribe.breeding - (takesHorses ? NATIVE_WAR.mountBreeding : 0) } },
  };
}

/** Everything one brave does this turn. */
export function braveTurn(state: GameState, braveUnitId: string, rng: Rng, events: NativeAiEvent[]): GameState {
  const start = state.units[braveUnitId];
  const home = start ? homeOfBrave(state, start.id) : null;
  if (!start || !home) return state;
  let next: GameState = { ...state, units: { ...state.units, [start.id]: { ...start, movesLeft: UNIT_TYPES[start.type].moves * MOVE_THIRDS } } };

  for (let step = 0; step < AI.maxSteps; step++) {
    const brave = next.units[braveUnitId];
    const village = next.settlements[home.id];
    if (!brave || !village || brave.movesLeft <= 0) break;
    next = rearm(next, brave, village, rng);
    const self = next.units[braveUnitId] as Unit;

    // whoever is beside the brave now knows of his tribe
    for (const p of next.players) {
      if (p.withdrawn || next.tribes[village.tribe]?.met.includes(p.id)) continue;
      const seen = Object.values(next.units).some((u) => u.owner === p.id && u.voyage === null && u.aboard === null && UNIT_TYPES[u.type].domain === 'land' && far(u.x, u.y, self.x, self.y) <= 1)
        || Object.values(next.colonies).some((c) => c.owner === p.id && far(c.x, c.y, self.x, self.y) <= 1);
      if (seen) next = greetTribe(next, village.tribe, p.id, events as VillageEvent[]);
    }

    const enemies = enemiesOf(next, village);
    const target = enemies.length > 0 ? nearestEnemy(next, self, enemies) : null;
    if (target) {
      if (target.d <= 1) {
        next = withRng(next, rng, (s) => braveAttacks(s, self.id, target.x, target.y, events as NativeWarEvent[]));
        break;
      }
      const toward = stepToward(next, self, target.x, target.y, rng);
      if (!toward) break;
      next = move(next, self, toward[0], toward[1]);
      continue;
    }

    // at peace: call on a colony alongside, once
    const beside = Object.values(next.colonies).find((c) => far(c.x, c.y, self.x, self.y) <= 1 && next.tribes[village.tribe]?.met.includes(c.owner));
    if (beside && rng.int(1, 100) <= AI.callChance) {
      next = withRng(next, rng, (s) => braveVisits(s, self.id, beside.id, events as NativeWarEvent[]));
      break;
    }
    // otherwise wander, keeping near home and sometimes drifting toward a colony close by
    const roam = AI.roam[TRIBES[village.tribe].tech] as number;
    const noticed = Object.values(next.colonies).filter((c) => far(c.x, c.y, village.x, village.y) <= AI.colonyNotice).sort((a, b) => far(a.x, a.y, self.x, self.y) - far(b.x, b.y, self.x, self.y))[0];
    const stroll = (): readonly [number, number] | null => {
      if (far(self.x, self.y, village.x, village.y) > roam) return stepToward(next, self, village.x, village.y, rng);
      if (noticed && !beside && rng.int(1, 100) <= AI.visitUrge) return stepToward(next, self, noticed.x, noticed.y, rng);
      const open = STEPS.filter(([dx, dy]) => canEnter(next, self, self.x + dx, self.y + dy) && far(self.x + dx, self.y + dy, village.x, village.y) <= roam);
      return open.length > 0 ? rng.pick(open) : null;
    };
    const heading = stroll();
    if (!heading) break;
    next = move(next, self, heading[0], heading[1]);
  }
  const done = next.units[braveUnitId];
  return done ? { ...next, units: { ...next.units, [done.id]: { ...done, movesLeft: 0 } } } : next;
}

/** Run a step that keeps its own random stream in the state, without losing ours. */
function withRng(state: GameState, rng: Rng, run: (s: GameState) => GameState): GameState {
  const out = run({ ...state, rng: rng.fork(`brave:${state.turn}:${Object.keys(state.units).length}:${rng.int(0, 1_000_000)}`).state() });
  return { ...out, rng: state.rng };
}

/** Herds multiply. */
function breed(state: GameState): GameState {
  let next = state;
  for (const tribe of TRIBE_IDS) {
    const record = next.tribes[tribe];
    if (!record || record.horses <= 0) continue;
    const people = Object.values(next.settlements).filter((s) => s.tribe === tribe).reduce((n, s) => n + s.population, 0);
    const cap = 2 * (people + AI.breedingCapBase);
    if (record.breeding >= cap) continue;
    next = { ...next, tribes: { ...next.tribes, [tribe]: { ...record, breeding: Math.min(cap, record.breeding + record.horses) } } };
  }
  return next;
}

/** Once a human power has declared independence, aggrieved tribes may side with the Crown. */
function crownAllies(state: GameState, rng: Rng, events: NativeAiEvent[]): GameState {
  const rebel = state.players.find((p) => p.kind === 'human' && p.atWar);
  if (!rebel) return state;
  let next = state;
  const d = DIFFICULTIES.indexOf(state.difficulty);
  for (const tribe of TRIBE_IDS) {
    const record = next.tribes[tribe];
    if (!record || record.joinedCrown || !Object.values(next.settlements).some((s) => s.tribe === tribe)) continue;
    const t = tribalAlarm(next, tribe, rebel.id);
    const aggrieved = record.grudge.includes(rebel.id) || (t >= AI.crownAlarmFrom && rng.int(1, AI.crownRollPerAlarm) <= t);
    if (!aggrieved || rng.int(0, 2 * (5 - d)) !== 0) continue;
    next = { ...next, tribes: { ...next.tribes, [tribe]: { ...record, joinedCrown: true } } };
    next = adjustTribalAlarm(next, tribe, rebel.id, AI.crownAlarm, rng, events as AlarmSink);
    // the rebels' missions among them are burned
    const settlements = { ...next.settlements };
    for (const s of Object.values(next.settlements)) if (s.tribe === tribe && s.mission?.owner === rebel.id) settlements[s.id] = { ...s, mission: null };
    next = { ...next, settlements };
    events.push({ type: 'tribeJoinedCrown', tribe, against: rebel.id });
  }
  return next;
}

/** The braves' part of the natives' turn: herds breed, tribes take sides, and every band moves. */
export function bravesTurn(state: GameState, events: NativeAiEvent[]): GameState {
  const braves = Object.values(state.units).filter((u) => isBrave(u) && tribeOfOwner(u.owner) !== null).map((u) => u.id).sort();
  if (braves.length === 0 && Object.keys(state.settlements).length === 0) return state;
  const rng = createRng(state.rng);
  let next = crownAllies(breed(state), rng, events);
  for (const id of braves) next = braveTurn(next, id, rng, events);
  return { ...next, rng: rng.state() };
}
