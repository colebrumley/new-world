import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { EDUCATION, ON_THE_JOB } from '../../../src/engine/data/education';
import { educate, teacherProblem, teachingLevel, type EducationEvent } from '../../../src/engine/education';
import type { Colonist, Colony, GameState } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~....~', '~~~~~~'];
const SCHOOL = ['schoolhouse'];
const COLLEGE = ['schoolhouse', 'college'];
const UNIVERSITY = ['schoolhouse', 'college', 'university'];
const teacher = (id: string, profession: Colonist['profession'], turns = 0): Colonist => ({ id, profession, job: { kind: 'work', trade: 'teacher' }, turns });
const pupil = (id: string, profession: Colonist['profession'] = 'freeColonist', job: Colonist['job'] = { kind: 'idle' }): Colonist => ({ id, profession, job, turns: 0 });
const town = (colonists: Colonist[], buildings: string[] = SCHOOL, seed: number | string = 1): GameState =>
  withColony(world({ rows: ROWS, seed }), { id: 'col', x: 2, y: 2, colonists, buildings, goods: { food: 100 } });
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const prof = (s: GameState, id: string): string | undefined => col(s).colonists.find((c) => c.id === id)?.profession;
const school = (s: GameState): { state: GameState; events: EducationEvent[] } => {
  const events: EducationEvent[] = [];
  return { state: educate(s, 'col', events), events };
};
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};

describe('who may teach', () => {
  it('takes the teaching level from the profession table', () => {
    expect({ EDUCATION, ON_THE_JOB }).toMatchSnapshot();
    expect(teachingLevel('expertFarmer')).toBe(1);
    expect(teachingLevel('masterCarpenter')).toBe(1);
    expect(teachingLevel('masterWeaver')).toBe(2);
    expect(teachingLevel('veteranSoldier')).toBe(2);
    expect(teachingLevel('elderStatesman')).toBe(3);
    expect(teachingLevel('jesuitMissionary')).toBe(3);
    for (const p of ['freeColonist', 'indenturedServant', 'pettyCriminal', 'indianConvert', 'expertTeacher'] as const) expect(teachingLevel(p)).toBe(0);
  });

  it('needs a school of the right level: Schoolhouse, College, University', () => {
    const c = col(town([]));
    expect(teacherProblem({ ...c, buildings: [] }, 'expertFarmer')).toBe('needBetterSchool');
    expect(teacherProblem({ ...c, buildings: SCHOOL }, 'expertFarmer')).toBeNull();
    expect(teacherProblem({ ...c, buildings: SCHOOL }, 'masterWeaver')).toBe('needBetterSchool');
    expect(teacherProblem({ ...c, buildings: COLLEGE }, 'masterWeaver')).toBeNull();
    expect(teacherProblem({ ...c, buildings: COLLEGE }, 'elderStatesman')).toBe('needBetterSchool');
    expect(teacherProblem({ ...c, buildings: UNIVERSITY }, 'elderStatesman')).toBeNull();
    expect(teacherProblem({ ...c, buildings: UNIVERSITY }, 'freeColonist')).toBe('notTeacher');
  });

  it('is enforced when assigning the job, along with one, two or three teachers per school', () => {
    const toTeach = (id: string): Action => ({ type: 'assignJob', colonyId: 'col', colonistId: id, job: { kind: 'work', trade: 'teacher' } });
    const s = town([pupil('f', 'expertFarmer'), pupil('w', 'masterWeaver'), pupil('x'), pupil('m', 'expertOreMiner')]);
    expect(code(s, toTeach('f'))).toBe('ok');
    expect(code(s, toTeach('w'))).toBe('needBetterSchool');
    expect(code(s, toTeach('x'))).toBe('notTeacher');
    const one = applyAction(s, toTeach('f')).state;
    expect(code(one, toTeach('m'))).toBe('buildingFull');
    expect(code({ ...one, colonies: { col: { ...col(one), buildings: COLLEGE } } }, toTeach('m'))).toBe('ok');
    expect(code(town([pupil('f', 'expertFarmer')], []), toTeach('f'))).toBe('noBuilding');
  });
});

describe('schooling', () => {
  it('a level-1 teacher graduates a pupil on his fourth turn, level 2 on the sixth, level 3 on the eighth', () => {
    const turnsToGraduate = (profession: Colonist['profession'], buildings: string[]): number => {
      let s = town([teacher('t', profession), pupil('p')], buildings);
      for (let turn = 1; turn <= 20; turn++) {
        const r = school(s);
        if (r.events.some((e) => e.type === 'colonistTaught')) return turn;
        s = r.state;
      }
      return -1;
    };
    expect(turnsToGraduate('expertFarmer', SCHOOL)).toBe(4);
    expect(turnsToGraduate('masterWeaver', COLLEGE)).toBe(6);
    expect(turnsToGraduate('elderStatesman', UNIVERSITY)).toBe(8);
    expect(turnsToGraduate('expertFarmer', UNIVERSITY)).toBe(4); // the teacher's own level counts, not the building
  });

  it('moves the pupil one rung: criminal, servant, free colonist, then the teacher\'s trade', () => {
    const ready = (p: Colonist['profession']): GameState => town([teacher('t', 'expertFarmer', 3), pupil('p', p)]);
    expect(prof(school(ready('pettyCriminal')).state, 'p')).toBe('indenturedServant');
    expect(prof(school(ready('indenturedServant')).state, 'p')).toBe('freeColonist');
    expect(prof(school(ready('freeColonist')).state, 'p')).toBe('expertFarmer');
    const r = school(ready('freeColonist'));
    expect(r.events).toEqual([{ type: 'colonistTaught', colonyId: 'col', teacherId: 't', studentId: 'p', from: 'freeColonist', to: 'expertFarmer' }]);
    expect(col(r.state).colonists.find((c) => c.id === 't')?.turns).toBe(0); // starts his term again
  });

  it('takes pupils from anywhere in the colony, but never a convert or a specialist', () => {
    const working = town([teacher('t', 'expertFarmer', 3), pupil('p', 'freeColonist', { kind: 'field', dx: 1, dy: 0, good: 'food' })]);
    expect(prof(school(working).state, 'p')).toBe('expertFarmer');
    const none = school(town([teacher('t', 'expertFarmer', 3), pupil('c', 'indianConvert'), pupil('e', 'masterWeaver')]));
    expect(none.events).toEqual([{ type: 'noStudent', colonyId: 'col', teacherId: 't' }]);
    expect(prof(none.state, 'c')).toBe('indianConvert');
    expect(col(none.state).colonists.find((c) => c.id === 't')?.turns).toBe(0); // the term is lost all the same
  });

  it('picks the pupil at random and never teaches the same one twice in a turn', () => {
    const chosen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = school(town([teacher('t', 'expertFarmer', 3), pupil('a'), pupil('b'), pupil('c')], SCHOOL, seed));
      chosen.add((r.events[0] as { studentId: string }).studentId);
    }
    expect(chosen.size).toBe(3);
    const two = school(town([teacher('t1', 'expertFarmer', 3), teacher('t2', 'expertOreMiner', 3), pupil('a', 'pettyCriminal')], COLLEGE));
    expect(two.events.map((e) => e.type)).toEqual(['colonistTaught', 'noStudent']);
    expect(prof(two.state, 'a')).toBe('indenturedServant'); // one rung only
  });

  it('graduates at most three in a turn, and a teacher out of post teaches nobody', () => {
    const many = town([
      teacher('t1', 'expertFarmer', 3), teacher('t2', 'expertOreMiner', 3), teacher('t3', 'expertLumberjack', 3),
      pupil('a'), pupil('b'), pupil('c'), pupil('d'),
    ], UNIVERSITY);
    expect(school(many).events.filter((e) => e.type === 'colonistTaught')).toHaveLength(3);
    const resting = town([{ ...teacher('t', 'expertFarmer', 9), job: { kind: 'idle' } }, pupil('p')]);
    expect(school(resting).events).toEqual([]);
  });

  it('changing job starts the count again', () => {
    let s = town([teacher('t', 'expertFarmer', 3), pupil('p')]);
    s = applyAction(s, { type: 'assignJob', colonyId: 'col', colonistId: 't', job: { kind: 'idle' } }).state;
    s = applyAction(s, { type: 'assignJob', colonyId: 'col', colonistId: 't', job: { kind: 'work', trade: 'teacher' } }).state;
    expect(col(s).colonists[0]?.turns).toBe(0);
    expect(school(s).events).toEqual([]);
    expect(col(school(s).state).colonists.map((c) => c.turns)).toEqual([1, 1]);
    const old = town([pupil('p')]);
    const aged = { ...old, colonies: { col: { ...col(old), colonists: [{ ...col(old).colonists[0]!, turns: 15 }] } } };
    expect(col(school(aged).state).colonists[0]?.turns).toBe(15);
  });

  it('runs as part of the colony turn', () => {
    const s = town([teacher('t', 'expertFarmer', 3), pupil('p')]);
    const r = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(r.events.map((e) => e.type)).toContain('colonistTaught');
    expect(prof(r.state, 'p')).toBe('expertFarmer');
  });
});

describe('learning by doing', () => {
  const planter = (profession: Colonist['profession'], good: 'sugar' | 'tobacco' | 'cotton' | 'furs' | 'food' | 'ore' = 'cotton'): GameState =>
    town([pupil('p', profession, { kind: 'field', dx: 1, dy: 0, good })], []);
  const promotions = (s0: (seed: number) => GameState, tries: number): number => {
    let n = 0;
    for (let seed = 1; seed <= tries; seed++) if (school(s0(seed)).events.some((e) => e.type === 'learnedByDoing')) n++;
    return n;
  };
  const seeded = (base: GameState) => (seed: number): GameState => ({ ...base, rng: world({ rows: ROWS, seed }).rng });

  it('a free colonist planting sugar, tobacco or cotton or trapping furs becomes the expert about one turn in a hundred', () => {
    const hits = promotions(seeded(planter('freeColonist')), 3000);
    expect(hits).toBeGreaterThan(12);
    expect(hits).toBeLessThan(55);
    const r = [...Array(3000).keys()].map((i) => school(seeded(planter('freeColonist', 'furs'))(i + 1))).find((x) => x.events.length > 0)!;
    expect(r.events).toEqual([{ type: 'learnedByDoing', colonyId: 'col', colonistId: 'p', to: 'expertFurTrapper' }]);
    expect(prof(r.state, 'p')).toBe('expertFurTrapper');
  });

  it('servants and criminals learn more slowly; converts and other work never', () => {
    const free = promotions(seeded(planter('freeColonist')), 6000);
    const servant = promotions(seeded(planter('indenturedServant')), 6000);
    const criminal = promotions(seeded(planter('pettyCriminal')), 6000);
    expect(servant).toBeGreaterThan(8);
    expect(servant).toBeLessThan(free);
    expect(criminal).toBeLessThan(servant + 12);
    expect(criminal).toBeGreaterThan(3);
    expect(promotions(seeded(planter('indianConvert')), 2000)).toBe(0);
    expect(promotions(seeded(planter('freeColonist', 'food')), 2000)).toBe(0);
    expect(promotions(seeded(planter('freeColonist', 'ore')), 2000)).toBe(0);
  });

  it('only happens while the power has no expert of that trade at all', () => {
    const withExpert = withUnit(planter('freeColonist'), { id: 'u9', x: 3, y: 3, profession: 'masterCottonPlanter' });
    expect(promotions(seeded(withExpert), 3000)).toBe(0);
    const foreign = withUnit(planter('freeColonist'), { id: 'u9', owner: 'b', x: 3, y: 3, profession: 'masterCottonPlanter' });
    expect(promotions(seeded(foreign), 3000)).toBeGreaterThan(10);
  });
});
