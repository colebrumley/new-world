import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { checkInvariants } from '../../../src/engine/invariants';
import { centerOutput, fieldOutput, jobOptions, squareStatus, workerAt } from '../../../src/engine/jobs';
import type { Colonist, Colony, GameState } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

// x: 0123456789
const ROWS = [
  '~~~~~~~~~~',
  '~.fh.....~',
  '~~.g..g..~',
  '~.w......~',
  '~~~~~~~~~~',
];
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const person = (id: string, job: Colonist['job'] = { kind: 'idle' }, profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id, profession, job, turns: 0 });
const town = (colonists: Colonist[], extra: Partial<Colony> = {}, players?: Parameters<typeof world>[0]['players']): GameState =>
  withColony(world({ rows: ROWS, ...(players ? { players } : {}) }), { id: 'col', x: 2, y: 2, colonists, ...extra });
const col = (s: GameState, id = 'col'): Colony => s.colonies[id] as Colony;

describe('which squares can be worked', () => {
  it('free land and sea around the colony are available; the colony square and beyond are not', () => {
    const s = town([person('a')]);
    expect(squareStatus(s, col(s), -1, -1)).toBe('free');
    expect(squareStatus(s, col(s), -1, 0)).toBe('free'); // the sea
    expect(squareStatus(s, col(s), 0, 0)).toBe('blocked');
    expect(squareStatus(s, col(s), 2, 0)).toBe('blocked');
    expect(squareStatus(withColony(world({ rows: ROWS }), { id: 'col', x: 1, y: 1 }), col(withColony(world({ rows: ROWS }), { id: 'col', x: 1, y: 1 })), -1, -1)).toBe('free');
  });

  it('a square worked by this colony, or by a neighbouring colony, is taken', () => {
    let s = town([person('a', { kind: 'field', dx: 1, dy: 0, good: 'food' })]);
    expect(squareStatus(s, col(s), 1, 0)).toBe('worked');
    expect(workerAt(col(s), 1, 0)?.id).toBe('a');
    // a second colony two squares east shares the column between them
    s = withColony(s, { id: 'east', x: 4, y: 2, colonists: [person('b', { kind: 'field', dx: -1, dy: -1, good: 'food' })] });
    expect(squareStatus(s, col(s), 1, -1)).toBe('otherColony');
    expect(squareStatus(s, col(s, 'east'), -1, 0)).toBe('otherColony');
    expect(squareStatus(s, col(s, 'east'), -1, 1)).toBe('free');
  });

  it('native land, foreign units and other settlements block a square', () => {
    const s = town([person('a')]);
    expect(squareStatus(setTile(s, 3, 2, { homeland: 'sioux' }), col(s), 1, 0)).toBe('nativeLand');
    expect(squareStatus(setTile(s, 3, 2, { homeland: 'sioux', claim: 'a' }), col(s), 1, 0)).toBe('free'); // bought
    expect(squareStatus(setTile(s, 3, 2, { homeland: 'sioux', claim: 'b' }), col(s), 1, 0)).toBe('nativeLand');
    expect(squareStatus(withUnit(s, { id: 'e', owner: 'b', x: 3, y: 2 }), col(s), 1, 0)).toBe('foreignUnit');
    expect(squareStatus(withUnit(s, { id: 'f', owner: 'a', x: 3, y: 2 }), col(s), 1, 0)).toBe('free');
  });
});

describe('output', () => {
  it('a colonist produces the tile yield for the chosen good', () => {
    const s = town([person('a')]);
    expect(fieldOutput(s, col(s), 'freeColonist', 0, -1, 'lumber')).toBe(6); // mixed forest
    expect(fieldOutput(s, col(s), 'expertLumberjack', 0, -1, 'lumber')).toBe(12);
    expect(fieldOutput(s, col(s), 'freeColonist', 1, 0, 'tobacco')).toBe(3); // grassland
    expect(fieldOutput(s, col(s), 'indianConvert', 1, 0, 'tobacco')).toBe(4);
    expect(fieldOutput(s, col(s), 'expertFarmer', -1, -1, 'food')).toBe(7);
    expect(fieldOutput(s, col(s), 'freeColonist', 5, 5, 'food')).toBe(0);
  });

  it('fishing needs Docks, and Hudson doubles furs', () => {
    const dry = town([person('a')]);
    expect(fieldOutput(dry, col(dry), 'freeColonist', -1, 0, 'fish')).toBe(0);
    const docks = town([person('a')], { buildings: ['docks'] });
    expect(fieldOutput(docks, col(docks), 'freeColonist', -1, 0, 'fish')).toBe(4);
    expect(fieldOutput(docks, col(docks), 'expertFisherman', -1, 0, 'fish')).toBe(6);
    const hudson = town([person('a')], {}, [{ id: 'a', fathers: ['henryHudson'] }, { id: 'b' }]);
    expect(fieldOutput(hudson, col(hudson), 'freeColonist', 0, -1, 'furs')).toBe(6);
    expect(fieldOutput(dry, col(dry), 'freeColonist', 0, -1, 'furs')).toBe(3);
  });

  it('the colony square yields food and its best secondary good with no worker, by difficulty', () => {
    const s = town([person('a')]); // plains
    expect(centerOutput(s, col(s))).toEqual({ food: 3, secondary: { good: 'cotton', amount: 2 } });
    const easy = withColony(world({ rows: ROWS, difficulty: 'discoverer' }), { id: 'col', x: 2, y: 2 });
    expect(centerOutput(easy, col(easy))).toEqual({ food: 5, secondary: { good: 'cotton', amount: 3 } });
    const grass = withColony(world({ rows: ROWS }), { id: 'col', x: 3, y: 2 });
    expect(centerOutput(grass, col(grass)).secondary).toEqual({ good: 'tobacco', amount: 3 });
    const timber = setTile(withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 1 }), 2, 1, { resource: 'beaver' });
    expect(centerOutput(timber, col(timber))).toEqual({ food: 2, secondary: { good: 'furs', amount: 6 } });
  });
});

describe('jobs menu', () => {
  it('shows for each good what the colonist makes here and the best free square elsewhere', () => {
    const s = town([person('a', { kind: 'field', dx: 1, dy: 0, good: 'tobacco' }), person('b', { kind: 'field', dx: -1, dy: -1, good: 'food' })]);
    const menu = Object.fromEntries(jobOptions(s, col(s), 'a').map((o) => [o.good, o]));
    expect(menu['tobacco']).toMatchObject({ here: 3, best: 3, bestAt: { dx: 1, dy: 0 } });
    expect(menu['food']).toMatchObject({ here: 3, best: 5 }); // plains elsewhere; b's plains square is taken
    expect(menu['food']?.bestAt).not.toEqual({ dx: -1, dy: -1 });
    expect(menu['lumber']).toMatchObject({ here: 0, best: 6, bestAt: { dx: 0, dy: -1 } });
    expect(menu['ore']).toMatchObject({ here: 0, best: 4, bestAt: { dx: 1, dy: -1 } }); // the hills
    expect(menu['sugar']).toMatchObject({ here: 0, best: 2 }); // the swamp
    expect(menu['fish']).toMatchObject({ here: 0, best: 0, bestAt: null }); // no Docks
    expect(menu['silver']).toMatchObject({ best: 0, bestAt: null });
    expect(jobOptions(s, col(s), 'ghost')).toEqual([]);
    const idle = jobOptions(s, col(s), 'b').find((o) => o.good === 'food');
    expect(idle).toMatchObject({ here: 5, best: 5 });
  });
});

describe('assigning work', () => {
  const s = town([person('a', { kind: 'field', dx: 1, dy: 0, good: 'tobacco' }), person('b'), person('x', { kind: 'idle' }, 'expertFarmer')], { buildings: ['docks'] });

  it('moves a colonist to a free square, changes the good in place, or takes them off work', () => {
    let next = applyAction(s, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: 0, dy: -1, good: 'lumber' } }).state;
    expect(col(next).colonists[1]?.job).toEqual({ kind: 'field', dx: 0, dy: -1, good: 'lumber' });
    next = applyAction(next, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: 0, dy: -1, good: 'furs' } }).state;
    expect(col(next).colonists[1]?.job).toMatchObject({ good: 'furs' });
    next = applyAction(next, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: -1, dy: 0, good: 'fish' } }).state;
    expect(checkInvariants(next)).toEqual([]);
    next = applyAction(next, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'idle' } }).state;
    expect(col(next).colonists[1]?.job).toEqual({ kind: 'idle' });
  });

  it('refuses taken squares, wrong work for the square, unknown people and foreign colonies', () => {
    expect(code(s, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: 1, dy: 0, good: 'food' } })).toBe('squareTaken');
    expect(code(s, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: 2, dy: 0, good: 'food' } })).toBe('squareTaken');
    expect(code(s, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: -1, dy: 0, good: 'food' } })).toBe('badJob'); // farming the sea
    expect(code(s, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: 0, dy: -1, good: 'fish' } })).toBe('badJob');
    expect(code(s, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'field', dx: 0, dy: -1, good: 'gold' as 'food' } })).toBe('badJob');
    expect(code(s, { type: 'assignJob', colonyId: 'col', colonistId: 'ghost', job: { kind: 'idle' } })).toBe('noSuchColonist');
    expect(code(s, { type: 'assignJob', colonyId: 'nope', colonistId: 'b', job: { kind: 'idle' } })).toBe('noColonyHere');
    const theirs = withColony(s, { ...col(s), owner: 'b' });
    expect(code(theirs, { type: 'assignJob', colonyId: 'col', colonistId: 'b', job: { kind: 'idle' } })).toBe('notYourColony');
  });

  it('Clear Specialty makes an expert a free colonist, and applies to nobody else', () => {
    const next = applyAction(s, { type: 'clearSpecialty', colonyId: 'col', colonistId: 'x' }).state;
    expect(col(next).colonists[2]?.profession).toBe('freeColonist');
    expect(code(s, { type: 'clearSpecialty', colonyId: 'col', colonistId: 'b' })).toBe('badJob');
    expect(code(next, { type: 'clearSpecialty', colonyId: 'col', colonistId: 'x' })).toBe('badJob');
  });
});
