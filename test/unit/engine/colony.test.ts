import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action } from '../../../src/engine/actions';
import { totalGoods } from '../../../src/engine/cargo';
import { bestFoodJob, nextColonyName, siteWarnings } from '../../../src/engine/colony';
import { COLONY_LIMITS, COLONY_NAMES, STARTING_BUILDINGS } from '../../../src/engine/data/colony';
import { checkInvariants } from '../../../src/engine/invariants';
import { landStepCost } from '../../../src/engine/movement';
import type { Colonist, Colony, GameState, Unit } from '../../../src/engine/state';
import { isExploredBy } from '../../../src/engine/tile';
import { deepFreeze } from '../../helpers/freeze';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

// x: 0123456789
const ROWS = [
  '~~~~~~~~~~',
  '~.f.m...~~',
  '~..g....~~',
  '~.....a.~~',
  '~~~~~~~~~~',
];
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const act = (s: GameState, a: Action): GameState => {
  const next = applyAction(deepFreeze(s), a).state;
  expect(checkInvariants(next)).toEqual([]);
  return next;
};
const settler = (x: number, y: number, extra: Partial<Parameters<typeof withUnit>[1]> = {}): GameState =>
  withUnit(world({ rows: ROWS }), { id: 'u1', x, y, ...extra });
const only = (s: GameState): Colony => Object.values(s.colonies)[0] as Colony;
const crowd = (n: number): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const } , turns: 0 }));

describe('colony name lists', () => {
  it('transcribes the four lists in order', () => {
    expect(COLONY_NAMES).toMatchSnapshot();
    expect(COLONY_NAMES.england.slice(0, 3)).toEqual(['Jamestown', 'Plymouth', 'Roanoke']);
    expect(COLONY_NAMES.france.slice(0, 3)).toEqual(['Quebec', 'Montreal', 'Guadeloupe']);
    expect(COLONY_NAMES.spain.slice(0, 3)).toEqual(['Isabella', 'Santo Domingo', 'San Salvador']);
    expect(COLONY_NAMES.netherlands.slice(0, 3)).toEqual(['New Amsterdam', 'Fort Orange', 'Fort Nassau']);
    expect([COLONY_NAMES.england.length, COLONY_NAMES.france.length, COLONY_NAMES.spain.length, COLONY_NAMES.netherlands.length]).toEqual([36, 66, 39, 32]);
    expect({ COLONY_LIMITS, STARTING_BUILDINGS }).toMatchSnapshot();
  });

  it('hands names out in order, per nation, skipping any in use', () => {
    const s = settler(2, 2);
    expect(nextColonyName(s, 'a')).toBe('Jamestown');
    expect(nextColonyName(s, 'b')).toBe('Quebec');
    const one = withColony(s, { id: 'c1', x: 6, y: 2, name: 'Jamestown' });
    expect(nextColonyName(one, 'a')).toBe('Plymouth');
    let full = s;
    COLONY_NAMES.england.forEach((name, i) => {
      full = { ...full, colonies: { ...full.colonies, [`n${i}`]: { ...(one.colonies['c1'] as Colony), id: `n${i}`, name } } };
    });
    expect(nextColonyName(full, 'a')).toBe('Jamestown 2');
  });
});

describe('founding', () => {
  it('turns the settler into the first colonist of a named colony with the starting buildings', () => {
    const start = settler(2, 2);
    const r = applyAction(start, { type: 'foundColony', unitId: 'u1' });
    const colony = only(r.state);
    expect(colony).toMatchObject({ owner: 'a', name: 'Jamestown', x: 2, y: 2, founded: 0, goods: {} });
    expect(colony.buildings).toEqual([...STARTING_BUILDINGS]);
    expect(colony.colonists).toHaveLength(1);
    expect(colony.colonists[0]).toMatchObject({ id: 'u1', profession: 'freeColonist' });
    expect(r.state.units['u1']).toBeUndefined();
    expect(r.events).toEqual([{ type: 'colonyFounded', colonyId: colony.id, owner: 'a', name: 'Jamestown', x: 2, y: 2 }]);
    expect(checkInvariants(r.state)).toEqual([]);
    expect(r.state.map.tiles[2 * 10 + 2]?.claim).toBe('a');
    expect(r.state.nextId).toBe(start.nextId + 1);
  });

  it('puts the founder to work at once (see placement.test.ts for how the square is chosen)', () => {
    const s = act(settler(2, 2), { type: 'foundColony', unitId: 'u1' });
    expect(only(s).colonists[0]?.job.kind).toBe('field');
    // a founder with nothing to work outdoors takes up the saw instead
    const coast = withUnit(world({ rows: ['~~~~~', '~~a~~', '~~.~~', '~~~~~', '~~~~~'] }), { id: 'u1', x: 2, y: 2, profession: 'expertFisherman' });
    const lone = only(act(coast, { type: 'foundColony', unitId: 'u1' })).colonists[0]?.job;
    expect(lone?.kind === 'work' || lone?.kind === 'field').toBe(true);
  });

  it('accepts a chosen name and rejects empty, overlong or duplicate ones', () => {
    expect(only(act(settler(2, 2), { type: 'foundColony', unitId: 'u1', name: '  New Hope ' })).name).toBe('New Hope');
    expect(code(settler(2, 2), { type: 'foundColony', unitId: 'u1', name: '   ' })).toBe('badName');
    expect(code(settler(2, 2), { type: 'foundColony', unitId: 'u1', name: 'x'.repeat(25) })).toBe('badName');
    const taken = withColony(settler(2, 2), { id: 'c9', x: 6, y: 2, name: 'Boston' });
    expect(code(taken, { type: 'foundColony', unitId: 'u1', name: 'Boston' })).toBe('badName');
  });

  it('hands the kit of a soldier, scout or pioneer to the new warehouse', () => {
    const soldier = settler(2, 2, { type: 'dragoon', profession: 'veteranSoldier' });
    const before = totalGoods(soldier);
    const s = act(soldier, { type: 'foundColony', unitId: 'u1' });
    expect(only(s).goods).toEqual({ muskets: 50, horses: 50 });
    expect(only(s).colonists[0]?.profession).toBe('veteranSoldier');
    expect(totalGoods(s)).toEqual(before);
    const pioneer = act(settler(2, 2, { type: 'pioneer', tools: 60 }), { type: 'foundColony', unitId: 'u1' });
    expect(only(pioneer).goods).toEqual({ tools: 60 });
  });

  it('is refused at sea, in the mountains, next to another colony, for converts and non-colonists', () => {
    expect(code(settler(4, 1), { type: 'foundColony', unitId: 'u1' })).toBe('tooMountainous');
    expect(code(settler(6, 3), { type: 'foundColony', unitId: 'u1' })).toBe('ok'); // arctic is allowed
    expect(code(settler(2, 2, { profession: 'indianConvert' }), { type: 'foundColony', unitId: 'u1' })).toBe('notColonist');
    expect(code(settler(2, 2, { type: 'wagonTrain' }), { type: 'foundColony', unitId: 'u1' })).toBe('notColonist');
    expect(code(settler(2, 2, { type: 'artillery' }), { type: 'foundColony', unitId: 'u1' })).toBe('notColonist');
    const aboard = withUnit(withUnit(world({ rows: ROWS }), { id: 'ship', type: 'caravel', x: 8, y: 2 }), { id: 'u1', x: 8, y: 2, aboard: 'ship' });
    expect(code(aboard, { type: 'foundColony', unitId: 'u1' })).toBe('notColonist');
    for (const [x, y] of [[3, 2], [3, 3], [1, 1], [2, 2]] as const) {
      const near = withColony(settler(2, 2), { id: 'c9', x, y });
      expect(code(near, { type: 'foundColony', unitId: 'u1' }), `${x},${y}`).toBe('tooNear');
    }
    expect(code(withColony(settler(2, 2), { id: 'c9', x: 4, y: 2 }), { type: 'foundColony', unitId: 'u1' })).toBe('ok');
    expect(code(withColony(settler(2, 2), { id: 'c9', x: 3, y: 2, owner: 'b' }), { type: 'foundColony', unitId: 'u1' })).toBe('tooNear');
  });

  it('is refused during the War of Independence, beyond 38 colonies of one power, and beyond 48 in all', () => {
    const war = withUnit(world({ rows: ROWS, players: [{ id: 'a', atWar: true }] }), { id: 'u1', x: 2, y: 2 });
    expect(code(war, { type: 'foundColony', unitId: 'u1' })).toBe('atWarNoFounding');
    const base = settler(2, 2);
    const template = withColony(base, { id: 'c0', x: 6, y: 2 }).colonies['c0'] as Colony;
    const fill = (mine: number, theirs: number): GameState => {
      const colonies: Record<string, Colony> = {};
      for (let i = 0; i < mine; i++) colonies[`m${i}`] = { ...template, id: `m${i}`, name: `M${i}`, x: 6, y: 1 };
      for (let i = 0; i < theirs; i++) colonies[`t${i}`] = { ...template, id: `t${i}`, name: `T${i}`, owner: 'b', x: 6, y: 1 };
      return { ...base, colonies };
    };
    expect(code(fill(37, 0), { type: 'foundColony', unitId: 'u1' })).toBe('ok');
    expect(code(fill(38, 0), { type: 'foundColony', unitId: 'u1' })).toBe('tooManyColonies');
    expect(code(fill(10, 37), { type: 'foundColony', unitId: 'u1' })).toBe('ok');
    expect(code(fill(10, 38), { type: 'foundColony', unitId: 'u1' })).toBe('tooManyColonies');
    // the 38 is a human's limit: a computer power is held only to the 48 in all
    const computer = (s: GameState): GameState => ({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, kind: 'ai' as const } : p)) });
    expect(code(computer(fill(38, 0)), { type: 'foundColony', unitId: 'u1' })).toBe('ok');
    expect(code(computer(fill(40, 8)), { type: 'foundColony', unitId: 'u1' })).toBe('tooManyColonies');
  });

  it('warns about a site with no ocean access on every level', () => {
    const inland = world({ rows: ['~~~~~~~', '~.....~', '~.fff.~', '~.f.f.~', '~.fff.~', '~.....~', '~~~~~~~'], difficulty: 'viceroy' });
    expect(siteWarnings(inland, 3, 3)).toEqual(['noPort']);
    expect(siteWarnings(inland, 1, 1)).toEqual([]);
    // a lake is not the ocean
    const lake = world({ rows: ['~~~~~~~', '~.....~', '~.f~f.~', '~.f.f.~', '~.fff.~', '~.....~', '~~~~~~~'], difficulty: 'viceroy' });
    expect(siteWarnings(lake, 3, 3)).toEqual(['noPort']);
  });

  it('on the two easiest levels also warns about little workable land and no forest alongside', () => {
    const easy = world({ rows: ROWS, difficulty: 'discoverer' });
    expect(siteWarnings(easy, 2, 2)).toEqual(['noPort']); // plenty of land and a forest, but landlocked
    expect(siteWarnings(easy, 1, 2)).toEqual([]);
    expect(siteWarnings(easy, 6, 2)).toEqual(['noPort', 'noForest']);
    expect(siteWarnings(world({ rows: ROWS, difficulty: 'conquistador' }), 6, 2)).toEqual(['noPort']);
    const island = world({ rows: ['~~~~~', '~~f~~', '~~.~~', '~~~~~', '~~~~~'], difficulty: 'explorer' });
    expect(siteWarnings(island, 2, 2)).toEqual(['fewSpaces']);
    // a special resource is worth a point of its own: three plain squares and one resource make four
    const three = world({ rows: ['~~~~~', '~ff~~', '~~.~~', '~~.~~', '~~~~~'], difficulty: 'explorer' });
    expect(siteWarnings(three, 2, 2)).toEqual(['fewSpaces']);
    expect(siteWarnings(setTile(three, 2, 1, { resource: 'beaver' }), 2, 2)).toEqual([]);
    // desert, arctic and land held by someone else do not count
    const poor = world({ rows: ['~~~~~~', '~faa.~', '~..a.~', '~....~', '~~~~~~'], difficulty: 'explorer' });
    expect(siteWarnings(setTile(setTile(poor, 1, 2, { claim: 'b' }), 1, 3, { homeland: 'sioux' }), 2, 2, 'a')).toEqual(['noPort', 'fewSpaces']);
  });

  it('makes the square a road end and reveals its surroundings', () => {
    const blank = { ...settler(2, 2), map: { ...settler(2, 2).map, tiles: settler(2, 2).map.tiles.map((t) => ({ ...t, explored: 0 })) } };
    const s = act(setTile(blank, 3, 2, { road: true }), { type: 'foundColony', unitId: 'u1' });
    expect(landStepCost(s, 3, 2, 2, 2)).toBe(1);
    expect(s.map.tiles.filter((t) => isExploredBy(t, 0))).toHaveLength(9);
  });
});

describe('joining and leaving', () => {
  const town = (extra: Partial<Colony> = {}): GameState => withUnit(withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 2, ...extra }), { id: 'u1', x: 2, y: 2 });

  it('a colonist on the colony square moves in, takes the best free food square, and hands in its kit', () => {
    const s = act(town(), { type: 'joinColony', unitId: 'u1' });
    const colony = only(s);
    expect(colony.colonists.map((c) => c.id)).toEqual(['col-settler', 'u1']);
    expect(colony.colonists[1]?.job).toMatchObject({ kind: 'field', good: 'food' });
    expect(s.units['u1']).toBeUndefined();
    const scout = withUnit(town(), { id: 'u1', x: 2, y: 2, type: 'scout', profession: 'seasonedScout' });
    expect(only(act(scout, { type: 'joinColony', unitId: 'u1' })).goods).toEqual({ horses: 50 });
  });

  it('two colonists never share a square', () => {
    let s = act(town(), { type: 'joinColony', unitId: 'u1' });
    s = act(withUnit(s, { id: 'u2', x: 2, y: 2 }), { type: 'joinColony', unitId: 'u2' });
    const squares = only(s).colonists.map((c) => (c.job.kind === 'field' ? `${c.job.dx},${c.job.dy}` : 'idle'));
    expect(new Set(squares).size).toBe(squares.length);
    expect(bestFoodJob(s, only(s), 'freeColonist').kind).toBe('field');
  });

  it('La Salle gives a colony its Stockade when the third colonist joins', () => {
    const players = [{ id: 'a', fathers: ['laSalle'] }, { id: 'b' }];
    const base = withUnit(withColony(world({ rows: ROWS, players }), { id: 'col', x: 2, y: 2, colonists: crowd(1) }), { id: 'u1', x: 2, y: 2 });
    const two = act(base, { type: 'joinColony', unitId: 'u1' });
    expect(only(two).buildings).not.toContain('stockade');
    const three = act(withUnit(two, { id: 'u2', x: 2, y: 2 }), { type: 'joinColony', unitId: 'u2' });
    expect(only(three).buildings).toContain('stockade');
    const four = act(withUnit(three, { id: 'u3', x: 2, y: 2 }), { type: 'joinColony', unitId: 'u3' });
    expect(only(four).buildings.filter((b) => b === 'stockade')).toHaveLength(1);
    const without = act(withUnit(withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 2, colonists: crowd(2) }), { id: 'u1', x: 2, y: 2 }), { type: 'joinColony', unitId: 'u1' });
    expect(only(without).buildings).not.toContain('stockade');
  });

  it('is refused away from a colony, in a foreign one, for non-colonists, and when 32 already live there', () => {
    expect(code(settler(5, 2), { type: 'joinColony', unitId: 'u1' })).toBe('noColonyHere');
    expect(code(town({ owner: 'b' }), { type: 'joinColony', unitId: 'u1' })).toBe('noColonyHere');
    expect(code(withUnit(town(), { id: 'u1', x: 2, y: 2, type: 'artillery' }), { type: 'joinColony', unitId: 'u1' })).toBe('notColonist');
    expect(code(town({ colonists: crowd(32) }), { type: 'joinColony', unitId: 'u1' })).toBe('colonyFull');
    expect(code(town({ colonists: crowd(31) }), { type: 'joinColony', unitId: 'u1' })).toBe('ok');
    expect(code(withUnit(town(), { id: 'u1', x: 2, y: 2, profession: 'indianConvert' }), { type: 'joinColony', unitId: 'u1' })).toBe('ok');
  });

  it('a colonist can step back out as a unit, but not the last one', () => {
    const s = act(town({ colonists: crowd(2) }), { type: 'leaveColony', colonyId: 'col', colonistId: 'x1' });
    expect(only(s).colonists.map((c) => c.id)).toEqual(['x0']);
    expect(u(s, 'x1')).toMatchObject({ type: 'colonist', profession: 'freeColonist', x: 2, y: 2, movesLeft: 0, owner: 'a' });
    expect(code(s, { type: 'leaveColony', colonyId: 'col', colonistId: 'x0' })).toBe('noSuchColonist');
    expect(code(s, { type: 'leaveColony', colonyId: 'col', colonistId: 'ghost' })).toBe('noSuchColonist');
    expect(code(s, { type: 'leaveColony', colonyId: 'nope', colonistId: 'x0' })).toBe('noColonyHere');
    expect(code(town({ owner: 'b', colonists: crowd(2) }), { type: 'leaveColony', colonyId: 'col', colonistId: 'x1' })).toBe('notYourColony');
  });

  it('a colony with a stockade, fort or fortress keeps at least three colonists and cannot be abandoned', () => {
    for (const building of ['stockade', 'fort', 'fortress']) {
      const three = town({ colonists: crowd(3), buildings: [building] });
      expect(code(three, { type: 'leaveColony', colonyId: 'col', colonistId: 'x0' })).toBe('keepStockade');
      expect(code(three, { type: 'abandonColony', colonyId: 'col' })).toBe('keepStockade');
      const four = town({ colonists: crowd(4), buildings: [building] });
      expect(code(four, { type: 'leaveColony', colonyId: 'col', colonistId: 'x0' })).toBe('ok');
    }
    expect(code(town({ colonists: crowd(3) }), { type: 'leaveColony', colonyId: 'col', colonistId: 'x0' })).toBe('ok');
  });
});

describe('abandoning and renaming', () => {
  const town = withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 2, name: 'Roanoke', goods: { furs: 40 }, colonists: crowd(2) });

  it('abandoning removes the colony, frees the land, and leaves its people standing there', () => {
    const r = applyAction(town, { type: 'abandonColony', colonyId: 'col' });
    expect(r.state.colonies).toEqual({});
    expect(Object.keys(r.state.units).sort()).toEqual(['x0', 'x1']);
    expect(u(r.state, 'x0')).toMatchObject({ x: 2, y: 2, type: 'colonist' });
    expect(r.events).toEqual([{ type: 'colonyAbandoned', colonyId: 'col', name: 'Roanoke' }]);
    expect(checkInvariants(r.state)).toEqual([]);
    // the site can be settled again
    expect(code({ ...r.state, units: { ...r.state.units, x0: { ...u(r.state, 'x0'), movesLeft: 3 } } }, { type: 'foundColony', unitId: 'x0' })).toBe('ok');
    expect(code(town, { type: 'abandonColony', colonyId: 'nope' })).toBe('noColonyHere');
  });

  it('renames a colony', () => {
    const r = applyAction(town, { type: 'renameColony', colonyId: 'col', name: ' Croatoan ' });
    expect(only(r.state).name).toBe('Croatoan');
    expect(code(town, { type: 'renameColony', colonyId: 'col', name: '' })).toBe('badName');
    expect(code(town, { type: 'renameColony', colonyId: 'col', name: 'Roanoke' })).toBe('ok'); // its own name
  });
});

describe('offered actions', () => {
  it('lists founding where legal and joining inside a colony', () => {
    expect(listValidActions(settler(2, 2))).toContainEqual({ type: 'foundColony', unitId: 'u1' });
    expect(listValidActions(settler(4, 1)).some((a) => a.type === 'foundColony')).toBe(false);
    const inTown = withUnit(withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 2 }), { id: 'u1', x: 2, y: 2 });
    const offered = listValidActions(inTown).map((a) => a.type);
    expect(offered).toContain('joinColony');
    expect(offered).not.toContain('foundColony');
  });
});
