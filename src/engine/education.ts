// Schools and experience (R-310): teachers turning out graduates, and unskilled hands becoming
// experts at the few crops that can be learned by doing.
import { chainLevel } from './data/buildings';
import { EDUCATION, ON_THE_JOB } from './data/education';
import { PROFESSION_IDS, PROFESSIONS, type ProfessionId } from './data/professions';
import { createRng } from './rng';
import type { Colonist, Colony, GameState } from './state';

export type EducationEvent =
  | { readonly type: 'colonistTaught'; readonly colonyId: string; readonly teacherId: string; readonly studentId: string; readonly from: ProfessionId; readonly to: ProfessionId }
  /** A teacher was ready to graduate someone and nobody in the colony could be taught. */
  | { readonly type: 'noStudent'; readonly colonyId: string; readonly teacherId: string }
  | { readonly type: 'learnedByDoing'; readonly colonyId: string; readonly colonistId: string; readonly to: ProfessionId };

/** Can this profession be taught, and in what school at least? 0 = never. */
export function teachingLevel(profession: ProfessionId): number {
  const level = PROFESSIONS[profession].teachLevel;
  return level >= 1 && level <= 3 && PROFESSIONS[profession].colonist ? level : 0;
}

export type TeacherProblem = 'notTeacher' | 'needBetterSchool';

/** Why this colonist cannot teach in this colony, or null if he can. */
export function teacherProblem(colony: Colony, profession: ProfessionId): TeacherProblem | null {
  const level = teachingLevel(profession);
  if (level === 0) return 'notTeacher';
  return level > chainLevel(colony.buildings, 'school') ? 'needBetterSchool' : null;
}

function nextRung(student: ProfessionId, teacher: ProfessionId): ProfessionId | null {
  const ladder: Partial<Record<ProfessionId, ProfessionId>> = EDUCATION.ladder;
  if (ladder[student]) return ladder[student] ?? null;
  return student === 'freeColonist' ? teacher : null;
}

const expertFor = (good: string): ProfessionId | null => PROFESSION_IDS.find((id) => PROFESSIONS[id].expertGood === good) ?? null;

/** How many of this power's people (in colonies or as units) already have the profession. */
function census(state: GameState, owner: string, profession: ProfessionId): number {
  let n = 0;
  for (const u of Object.values(state.units)) if (u.owner === owner && u.profession === profession) n++;
  for (const c of Object.values(state.colonies)) if (c.owner === owner) n += c.colonists.filter((p) => p.profession === profession).length;
  return n;
}

/**
 * One colony's schooling for a turn. Every colonist's counter goes up by one; a teacher whose
 * counter has reached his term graduates one pupil picked at random and starts again.
 */
export function educate(state: GameState, colonyId: string, events: EducationEvent[]): GameState {
  const colony = state.colonies[colonyId];
  if (!colony) return state;
  const rng = createRng(state.rng);
  let rolled = false;
  let colonists: Colonist[] = [...colony.colonists];
  const taughtThisTurn = new Set<string>();
  let graduations = 0;
  let stop = false;

  for (const teacher of colony.colonists) {
    if (teacher.job.kind !== 'work' || teacher.job.trade !== 'teacher') continue;
    const term = EDUCATION.turnsByLevel[teachingLevel(teacher.profession)] ?? 0;
    if (term === 0 || teacher.turns + 1 < term) continue;
    // ready: the counter starts again whether or not a pupil is found
    colonists = colonists.map((c) => (c.id === teacher.id ? { ...c, turns: -1 } : c));
    if (stop || graduations >= EDUCATION.maxPerTurn) continue;
    const pool = colonists.filter((c) => c.id !== teacher.id && !taughtThisTurn.has(c.id) && nextRung(c.profession, teacher.profession) !== null);
    if (pool.length === 0) {
      events.push({ type: 'noStudent', colonyId, teacherId: teacher.id });
      stop = true;
      continue;
    }
    const student = rng.pick(pool);
    rolled = true;
    const to = nextRung(student.profession, teacher.profession) as ProfessionId;
    colonists = colonists.map((c) => (c.id === student.id ? { ...c, profession: to } : c));
    taughtThisTurn.add(student.id);
    graduations++;
    events.push({ type: 'colonistTaught', colonyId, teacherId: teacher.id, studentId: student.id, from: student.profession, to });
  }

  // learning by doing: a few crops only, and only while the power has no expert of that kind at all
  let next: GameState = state;
  const promoted: Colonist[] = [];
  for (const c of colonists) {
    const odds = (ON_THE_JOB.odds as Partial<Record<ProfessionId, number>>)[c.profession];
    if (odds === undefined || c.job.kind !== 'field' || !(ON_THE_JOB.goods as readonly string[]).includes(c.job.good)) {
      promoted.push(c);
      continue;
    }
    const to = expertFor(c.job.good);
    const lucky = rng.int(1, odds) === 1;
    rolled = true;
    const working: GameState = { ...next, colonies: { ...next.colonies, [colonyId]: { ...colony, colonists: [...promoted, ...colonists.slice(promoted.length)] } } };
    if (lucky && to && census(working, colony.owner, to) === 0) {
      promoted.push({ ...c, profession: to });
      events.push({ type: 'learnedByDoing', colonyId, colonistId: c.id, to });
    } else {
      promoted.push(c);
    }
    next = working;
  }

  // everyone has been at their post one turn longer
  const aged = promoted.map((c) => ({ ...c, turns: Math.min(EDUCATION.counterMax, c.turns + 1) }));
  return { ...state, rng: rolled ? rng.state() : state.rng, colonies: { ...state.colonies, [colonyId]: { ...colony, colonists: aged } } };
}
