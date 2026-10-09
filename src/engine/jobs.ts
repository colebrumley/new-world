// Who works where around a colony (R-302): which of the eight surrounding squares are
// available, what a colonist would produce on each, and the colony square's own output.
import { isNativeLand } from './settlements';
import { NEIGHBORS } from './colony';
import { chainLevel } from './data/buildings';
import { PRODUCTION, TRADE_IDS, TRADES } from './data/production';
import { PROFESSIONS } from './data/professions';
import { RAW_GOODS, type RawGood } from './data/terrain';
import { teacherProblem } from './education';
import { toryPenalty } from './liberty';
import { colonyAt, hasFather, tileAt, type Colonist, type Colony, type GameState, type Job, type UnitId } from './state';
import { isWater, type Tile } from './tile';
import { colonyCenterYield, countWaterNeighbors, tileYield, type CenterYield, type OutdoorWorker, type YieldContext } from './yields';

export type SquareStatus =
  /** Nobody is using it. */
  | 'free'
  /** One of this colony's own colonists works it. */
  | 'worked'
  /** A colonist of a neighbouring colony works it. */
  | 'otherColony'
  /** Native land that has not been bought or taken. */
  | 'nativeLand'
  /** A foreign unit stands on it. */
  | 'foreignUnit'
  /** Another settlement stands there, or it is off the map. */
  | 'blocked';

export function workerProfile(profession: Colonist['profession']): OutdoorWorker {
  return { expertGood: PROFESSIONS[profession].expertGood, convert: profession === 'indianConvert' };
}

/** The colonist (of this colony) working the square at (dx, dy), if any. */
export function workerAt(colony: Colony, dx: number, dy: number): Colonist | null {
  return colony.colonists.find((c) => c.job.kind === 'field' && c.job.dx === dx && c.job.dy === dy) ?? null;
}

export function squareStatus(state: GameState, colony: Colony, dx: number, dy: number): SquareStatus {
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return 'blocked';
  const x = colony.x + dx;
  const y = colony.y + dy;
  const tile = tileAt(state.map, x, y);
  if (!tile || colonyAt(state, x, y)) return 'blocked';
  if (workerAt(colony, dx, dy)) return 'worked';
  for (const other of Object.values(state.colonies)) {
    if (other.id !== colony.id && workerAt(other, x - other.x, y - other.y)) return 'otherColony';
  }
  if (Object.values(state.units).some((u) => u.x === x && u.y === y && u.owner !== colony.owner)) return 'foreignUnit';
  if (isNativeLand(state, tile, colony.owner)) return 'nativeLand';
  return 'free';
}

/** Conditions in this colony that bear on what a square yields. */
export function yieldContextFor(state: GameState, colony: Colony, x: number, y: number): YieldContext {
  return {
    waterNeighbors: countWaterNeighbors(state.map, x, y),
    solBonus: colony.solLevel,
    toryPenalty: toryPenalty(state, colony),
    hasDocks: colony.buildings.includes('docks'),
    hasHudson: hasFather(state, colony.owner, 'henryHudson'),
  };
}

/** What a colonist of this profession would produce of `good` on the square at (dx, dy). */
export function fieldOutput(state: GameState, colony: Colony, profession: Colonist['profession'], dx: number, dy: number, good: RawGood): number {
  const x = colony.x + dx;
  const y = colony.y + dy;
  const tile = tileAt(state.map, x, y);
  if (!tile) return 0;
  return tileYield(tile, good, workerProfile(profession), yieldContextFor(state, colony, x, y));
}

/** What the colony's own square yields with nobody working it. */
export function centerOutput(state: GameState, colony: Colony): CenterYield {
  return colonyCenterYield(tileAt(state.map, colony.x, colony.y) as Tile, state.difficulty, colony.solLevel);
}

export interface JobOption {
  readonly good: RawGood;
  /** Output on the square the colonist is on now (0 if not on one). */
  readonly here: number;
  /** Best output on any square open to this colonist, and where. */
  readonly best: number;
  readonly bestAt: { readonly dx: number; readonly dy: number } | null;
}

/** The jobs menu for a colonist: for each outdoor good, what they make here and the best they could make elsewhere. */
export function jobOptions(state: GameState, colony: Colony, colonistId: UnitId): JobOption[] {
  const colonist = colony.colonists.find((c) => c.id === colonistId);
  if (!colonist) return [];
  const own = colonist.job.kind === 'field' ? colonist.job : null;
  return RAW_GOODS.map((good) => {
    let best = 0;
    let bestAt: JobOption['bestAt'] = null;
    for (const [dx, dy] of NEIGHBORS) {
      const mine = own !== null && own.dx === dx && own.dy === dy;
      if (!mine && squareStatus(state, colony, dx, dy) !== 'free') continue;
      const amount = fieldOutput(state, colony, colonist.profession, dx, dy, good);
      if (amount > best) {
        best = amount;
        bestAt = { dx, dy };
      }
    }
    return { good, here: own ? fieldOutput(state, colony, colonist.profession, own.dx, own.dy, good) : 0, best, bestAt };
  });
}

export type JobErrorCode = 'notTeacher' | 'needBetterSchool' | 'noColonyHere' | 'noSuchColonist' | 'squareTaken' | 'badJob' | 'noBuilding' | 'buildingFull';
export type JobCheck = { readonly ok: true } | { readonly ok: false; readonly code: JobErrorCode; readonly message: string };

const REASONS: Readonly<Record<Exclude<SquareStatus, 'free'>, string>> = {
  worked: 'another colonist already works that square',
  otherColony: 'a neighbouring colony works that square',
  nativeLand: 'that land belongs to the natives',
  foreignUnit: 'a foreign unit occupies that square',
  blocked: 'that square cannot be worked',
};

export function checkAssign(state: GameState, colony: Colony | undefined, colonistId: UnitId, job: Job): JobCheck {
  if (!colony) return { ok: false, code: 'noColonyHere', message: 'no such colony' };
  const colonist = colony.colonists.find((c) => c.id === colonistId);
  if (!colonist) return { ok: false, code: 'noSuchColonist', message: 'no such colonist in that colony' };
  if (job.kind === 'idle') return { ok: true };
  if (job.kind === 'work') {
    if (!TRADE_IDS.includes(job.trade)) return { ok: false, code: 'badJob', message: 'unknown job' };
    const level = chainLevel(colony.buildings, TRADES[job.trade].chain);
    if (level === 0) return { ok: false, code: 'noBuilding', message: `this colony has no building for a ${TRADES[job.trade].name.toLowerCase()}` };
    const already = colonist.job.kind === 'work' && colonist.job.trade === job.trade;
    const others = colony.colonists.filter((c) => c.id !== colonistId && c.job.kind === 'work' && c.job.trade === job.trade).length;
    const room = job.trade === 'teacher' ? (PRODUCTION.teachers[level] ?? 0) : PRODUCTION.workersPerBuilding;
    if (!already && others >= room) return { ok: false, code: 'buildingFull', message: `no more than ${room} can work there` };
    if (job.trade === 'teacher') {
      const problem = teacherProblem(colony, colonist.profession);
      if (problem === 'notTeacher') return { ok: false, code: problem, message: 'only a specialist can teach his trade' };
      if (problem === 'needBetterSchool') return { ok: false, code: problem, message: 'that trade can only be taught in a higher school' };
    }
    return { ok: true };
  }
  if (job.kind !== 'field' || !RAW_GOODS.includes(job.good)) return { ok: false, code: 'badJob', message: 'unknown job' };
  const tile = tileAt(state.map, colony.x + job.dx, colony.y + job.dy);
  // fish come from water and everything else from land
  if (tile && isWater(tile) !== (job.good === 'fish')) return { ok: false, code: 'badJob', message: 'that square does not offer that work' };
  const mine = colonist.job.kind === 'field' && colonist.job.dx === job.dx && colonist.job.dy === job.dy;
  const status = mine ? 'free' : squareStatus(state, colony, job.dx, job.dy);
  if (status !== 'free') return { ok: false, code: 'squareTaken', message: REASONS[status] };
  return { ok: true };
}

export function assignJob(state: GameState, colony: Colony, colonistId: UnitId, job: Job): GameState {
  // a new post starts the colonist's time in the job afresh; changing crop on the same square does too
  const colonists = colony.colonists.map((c) => (c.id === colonistId ? { ...c, job, turns: 0 } : c));
  return { ...state, colonies: { ...state.colonies, [colony.id]: { ...colony, colonists } } };
}
