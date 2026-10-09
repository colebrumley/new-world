// Braves as units (R-506/R-507): each settlement keeps one band in the field, named after it and
// owned by the tribe. Here they are created; what they do is in native-war.ts and R-507.
import { NATIVE_WAR as W } from './data/native-war';
import type { UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import type { Rng } from './rng';
import { braveId, settlementAt, tribeOwner } from './settlements';
import { colonyAt, type GameState, type Settlement, type TribeState, type Unit } from './state';
import { isWater } from './tile';

const putUnit = (state: GameState, unit: Unit): GameState => ({ ...state, units: { ...state.units, [unit.id]: unit } });

/** The kind of brave a tribe can put in the field just now. */
export function braveTypeFor(tribe: TribeState | undefined, mountedAt: number): UnitTypeId {
  const armed = (tribe?.muskets ?? 0) > 0;
  const mounted = (tribe?.breeding ?? 0) >= mountedAt;
  return armed ? (mounted ? 'mountedWarrior' : 'armedBrave') : mounted ? 'mountedBrave' : 'brave';
}

function newBrave(settlement: Settlement, type: UnitTypeId, x: number, y: number): Unit {
  return {
    id: braveId(settlement.id), owner: tribeOwner(settlement.tribe), type, profession: null, x, y, movesLeft: 0, orders: 'none', destination: null,
    aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
  };
}

/** Put each settlement's first brave on a free land square within two of it (on the settlement itself if there is none). */
export function placeBraves(state: GameState, rng: Rng): GameState {
  let next = state;
  for (const s of Object.values(state.settlements)) {
    const free: [number, number][] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = s.x + dx;
        const y = s.y + dy;
        const tile = next.map.tiles[y * next.map.width + x];
        if (!tile || x <= 0 || y <= 0 || x >= next.map.width - 1 || y >= next.map.height - 1 || isWater(tile) || tile.relief === 'mountains') continue;
        if ((dx !== 0 || dy !== 0) && (settlementAt(next, x, y) || colonyAt(next, x, y))) continue;
        if (Object.values(next.units).some((u) => u.x === x && u.y === y)) continue;
        free.push([x, y]);
      }
    }
    const [x, y] = free.length > 0 ? rng.pick(free) : [s.x, s.y];
    next = putUnit(next, newBrave(s, 'brave', x, y));
  }
  return next;
}

/** A settlement that has lost its brave raises another, armed and mounted as the tribe can afford. */
export function raiseBrave(state: GameState, settlement: Settlement, rng: Rng): GameState {
  const tribe = state.tribes[settlement.tribe];
  const type = braveTypeFor(tribe, W.mountBreeding);
  let next = putUnit(state, newBrave(settlement, type, settlement.x, settlement.y));
  const armed = type === 'armedBrave' || type === 'mountedWarrior';
  const mounted = type === 'mountedBrave' || type === 'mountedWarrior';
  const human = state.players.some((p) => p.kind === 'human');
  const spend = armed && rng.int(0, human ? DIFFICULTIES.indexOf(state.difficulty) : 0) === 0;
  if (!tribe) return next;
  const record: TribeState = { ...tribe, muskets: tribe.muskets - (spend ? 1 : 0), breeding: tribe.breeding - (mounted ? W.mountBreeding : 0) };
  next = { ...next, tribes: { ...next.tribes, [settlement.tribe]: record } };
  return next;
}
