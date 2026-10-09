import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { PIONEER_WORK, WAREHOUSE } from '../../../src/engine/data/pioneer';
import { TERRAIN_IDS, type TerrainId } from '../../../src/engine/data/terrain';
import { checkInvariants } from '../../../src/engine/invariants';
import { jobTurns, salvagedLumber, warehouseCapacity } from '../../../src/engine/pioneer';
import type { Colony, GameState, Unit } from '../../../src/engine/state';
import { makeTile, type Tile } from '../../../src/engine/tile';
import { deepFreeze } from '../../helpers/freeze';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

// x: 0123456789
const ROWS = [
  '~~~~~~~~~~',
  '~.f.hm.w.~',
  '~.f.....a~',
  '~.f...=..~',
  '~~~~~~~~~~',
];
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const tile = (s: GameState, x: number, y: number): Tile => s.map.tiles[y * s.map.width + x] as Tile;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const act = (s: GameState, a: Action): GameState => {
  const next = applyAction(deepFreeze(s), a).state;
  expect(checkInvariants(next)).toEqual([]);
  return next;
};
const endRound = (s: GameState): GameState => act(act(s, { type: 'endTurn' }), { type: 'endTurn' });
const pioneer = (x: number, y: number, hardy = false, tools = 100): GameState =>
  withUnit(withUnit(world({ rows: ROWS }), { id: 'p', type: 'pioneer', x, y, tools, profession: hardy ? 'hardyPioneer' : 'freeColonist' }), { id: 'e', owner: 'b', x: 8, y: 3 });

/** Give the order and end rounds until the unit stands down; returns the turn count including the order turn. */
function workUntilDone(start: GameState, job: 'plow' | 'road'): { state: GameState; turns: number } {
  let s = act(start, { type: 'pioneerWork', unitId: 'p', job });
  let turns = 1;
  while (u(s, 'p').orders === job && turns < 30) {
    s = endRound(s);
    turns++;
  }
  return { state: s, turns };
}

describe('job length', () => {
  const sample = (id: TerrainId): Tile => {
    const forests: Record<string, Tile> = {
      boreal: makeTile({ base: 'tundra', forest: true }), scrub: makeTile({ base: 'desert', forest: true }),
      mixed: makeTile({ base: 'plains', forest: true }), broadleaf: makeTile({ base: 'prairie', forest: true }),
      conifer: makeTile({ base: 'grassland', forest: true }), tropical: makeTile({ base: 'savannah', forest: true }),
      wetland: makeTile({ base: 'marsh', forest: true }), rain: makeTile({ base: 'swamp', forest: true }),
      hills: makeTile({ base: 'plains', relief: 'hills' }), mountains: makeTile({ base: 'plains', relief: 'mountains' }),
    };
    return forests[id] ?? makeTile({ base: id as 'plains' });
  };

  it('matches the table: road = improvement value, clear or plow = that + 2, hardy = half rounded down', () => {
    expect({ PIONEER_WORK, WAREHOUSE }).toMatchSnapshot();
    const table: Record<string, [number, number, number, number]> = {
      // road, hardy road, plow/clear, hardy plow/clear
      tundra: [4, 2, 6, 3], arctic: [4, 2, 6, 3], hills: [4, 2, 6, 3], boreal: [4, 2, 6, 3], scrub: [4, 2, 6, 3],
      mixed: [4, 2, 6, 3], broadleaf: [4, 2, 6, 3], conifer: [4, 2, 6, 3],
      desert: [3, 1, 5, 2], plains: [3, 1, 5, 2], prairie: [3, 1, 5, 2], grassland: [3, 1, 5, 2], savannah: [3, 1, 5, 2],
      marsh: [5, 2, 7, 3], swamp: [7, 3, 9, 4], rain: [7, 3, 9, 4], mountains: [7, 3, 9, 4],
      tropical: [6, 3, 8, 4], wetland: [6, 3, 8, 4],
    };
    for (const id of TERRAIN_IDS) {
      const want = table[id];
      if (!want) continue;
      const t = sample(id);
      expect([jobTurns(t, 'road', false), jobTurns(t, 'road', true), jobTurns(t, 'plow', false), jobTurns(t, 'plow', true)], id).toEqual(want);
    }
    expect(Object.keys(table)).toHaveLength(19);
  });
});

describe('roads', () => {
  it('take the terrain time, counting the order turn, and use 20 tools on completion', () => {
    const start = pioneer(1, 1);
    const ordered = applyAction(start, { type: 'pioneerWork', unitId: 'p', job: 'road' });
    expect(u(ordered.state, 'p')).toMatchObject({ orders: 'road', workTurns: 1, movesLeft: 0, tools: 100 });
    expect(ordered.events).toEqual([{ type: 'ordersChanged', unitId: 'p', orders: 'road' }]);
    const { state, turns } = workUntilDone(start, 'road');
    expect(turns).toBe(3);
    expect(tile(state, 1, 1).road).toBe(true);
    expect(u(state, 'p')).toMatchObject({ orders: 'none', tools: 80, type: 'pioneer', workTurns: 0 });
  });

  it('a hardy pioneer builds a plains road on the spot', () => {
    const r = applyAction(pioneer(1, 1, true), { type: 'pioneerWork', unitId: 'p', job: 'road' });
    expect(tile(r.state, 1, 1).road).toBe(true);
    expect(u(r.state, 'p')).toMatchObject({ orders: 'none', tools: 80, movesLeft: 0 });
    expect(r.events).toContainEqual({ type: 'tileImproved', x: 1, y: 1, improvement: 'road', unitId: 'p' });
  });

  it('can be built on any land, mountains and hills included, but not twice or in a colony', () => {
    expect(workUntilDone(pioneer(5, 1), 'road').turns).toBe(7);
    expect(code(pioneer(4, 1), { type: 'pioneerWork', unitId: 'p', job: 'road' })).toBe('ok');
    expect(code(pioneer(8, 2), { type: 'pioneerWork', unitId: 'p', job: 'road' })).toBe('ok'); // arctic
    expect(code(pioneer(6, 3), { type: 'pioneerWork', unitId: 'p', job: 'road' })).toBe('alreadyRoad');
    const inColony = withColony(pioneer(3, 2), { id: 'col', x: 3, y: 2 });
    expect(code(inColony, { type: 'pioneerWork', unitId: 'p', job: 'road' })).toBe('alreadyRoad');
  });
});

describe('clearing and plowing', () => {
  it('plowing open land takes improvement + 2 turns and marks it plowed', () => {
    const { state, turns } = workUntilDone(pioneer(1, 1), 'plow');
    expect(turns).toBe(5);
    expect(tile(state, 1, 1)).toMatchObject({ plowed: true, forest: false });
    expect(u(state, 'p').tools).toBe(80);
    expect(u(state, 'p').movesLeft).toBe(0); // finishing the job took the turn
    expect(code(endRound(state), { type: 'pioneerWork', unitId: 'p', job: 'plow' })).toBe('alreadyPlowed');
  });

  it('the same order on forest clears it first; the land is open, not yet plowed, and never regrows', () => {
    const cleared = workUntilDone(pioneer(2, 1), 'plow');
    expect(cleared.turns).toBe(6);
    expect(tile(cleared.state, 2, 1)).toMatchObject({ forest: false, plowed: false, base: 'plains' });
    const plowed = workUntilDone(endRound(cleared.state), 'plow');
    expect(plowed.turns).toBe(5);
    expect(tile(plowed.state, 2, 1)).toMatchObject({ forest: false, plowed: true });
    expect(u(plowed.state, 'p').tools).toBe(60);
    let later = plowed.state;
    for (let i = 0; i < 10; i++) later = endRound(later);
    expect(tile(later, 2, 1).forest).toBe(false);
  });

  it('hardy pioneers take half the time', () => {
    expect(workUntilDone(pioneer(1, 1, true), 'plow').turns).toBe(2);
    expect(workUntilDone(pioneer(2, 1, true), 'plow').turns).toBe(3);
  });

  it('hills and mountains cannot be plowed; water cannot be improved', () => {
    expect(code(pioneer(4, 1), { type: 'pioneerWork', unitId: 'p', job: 'plow' })).toBe('cannotImprove');
    expect(code(pioneer(5, 1), { type: 'pioneerWork', unitId: 'p', job: 'plow' })).toBe('cannotImprove');
    expect(code(pioneer(7, 1), { type: 'pioneerWork', unitId: 'p', job: 'plow' })).toBe('ok'); // swamp
  });
});

describe('who may work, and interruptions', () => {
  it('only a pioneer, on the map, with movement left', () => {
    const colonist = withUnit(world({ rows: ROWS }), { id: 'p', x: 1, y: 1 });
    expect(code(colonist, { type: 'pioneerWork', unitId: 'p', job: 'road' })).toBe('notPioneer');
    const tired = withUnit(world({ rows: ROWS }), { id: 'p', type: 'pioneer', x: 1, y: 1, movesLeft: 0 });
    expect(code(tired, { type: 'pioneerWork', unitId: 'p', job: 'road' })).toBe('noMovesLeft');
    expect(code(pioneer(1, 1), { type: 'pioneerWork', unitId: 'p', job: 'dig' as 'road' })).toBe('badOrders');
    expect(code(pioneer(1, 1), { type: 'pioneerWork', unitId: 'e', job: 'road' })).toBe('notYourUnit');
  });

  it('moving away abandons the job and its progress; so do new orders', () => {
    let s = endRound(act(pioneer(1, 1), { type: 'pioneerWork', unitId: 'p', job: 'plow' }));
    expect(u(s, 'p')).toMatchObject({ orders: 'plow', workTurns: 2, movesLeft: 0 });
    const rested = { ...s, units: { ...s.units, p: { ...u(s, 'p'), movesLeft: 3 } } };
    expect(u(act(rested, { type: 'moveUnit', unitId: 'p', dx: 0, dy: 1 }), 'p')).toMatchObject({ orders: 'none', workTurns: 0 });
    expect(u(act(s, { type: 'setOrders', unitId: 'p', orders: 'sentry' }), 'p')).toMatchObject({ orders: 'sentry', workTurns: 0 });
    s = act(s, { type: 'setOrders', unitId: 'p', orders: 'none' });
    expect(tile(endRound(endRound(endRound(endRound(s)))), 1, 1).plowed).toBe(false);
  });

  it('a job stops if someone else finishes it first', () => {
    let s = act(pioneer(1, 1), { type: 'pioneerWork', unitId: 'p', job: 'road' });
    s = endRound(setTile(s, 1, 1, { road: true }));
    expect(u(s, 'p')).toMatchObject({ orders: 'none', tools: 100 });
  });

  it('the last 20 tools build one more thing, then the pioneer is a colonist again', () => {
    const r = applyAction(pioneer(1, 1, true, 20), { type: 'pioneerWork', unitId: 'p', job: 'road' });
    expect(u(r.state, 'p')).toMatchObject({ type: 'colonist', tools: 0, profession: 'hardyPioneer' });
    expect(r.events).toContainEqual({ type: 'toolsUsedUp', unitId: 'p' });
    expect(checkInvariants(r.state)).toEqual([]);
    expect(code(endRound(r.state), { type: 'pioneerWork', unitId: 'p', job: 'plow' })).toBe('notPioneer');
  });
});

describe('lumber from clearing', () => {
  const colonyAtXY = (s: GameState, x: number, y: number, extra: Partial<Colony> = {}): GameState => withColony(s, { id: 'col', x, y, ...extra });
  const clearAt = (s: GameState): { lumber: number; events: string[] } => {
    const done = workUntilDone(s, 'plow');
    return { lumber: done.state.colonies['col']?.goods.lumber ?? 0, events: [] };
  };

  it('gives the nearest own colony within 3 squares 20 lumber, or (forest lumber + 1) x 20 with a Lumber Mill', () => {
    expect(clearAt(colonyAtXY(pioneer(2, 1), 3, 2)).lumber).toBe(20);
    // mixed forest has 3 lumber in the table: (3 + 1) x 20
    expect(clearAt(colonyAtXY(pioneer(2, 1), 3, 2, { buildings: ['lumberMill', 'warehouse'] })).lumber).toBe(80);
    const forest = makeTile({ base: 'plains', forest: true });
    const plain: Colony = { id: 'c', owner: 'a', name: 'c', x: 0, y: 0, goods: {}, buildings: [], colonists: [], founded: 0, exports: [], hammers: 0, construction: null, sol: { n: 0, d: 100 }, solLevel: 0, toryNoticed: false };
    expect(salvagedLumber(forest, plain, false)).toBe(20);
    expect(salvagedLumber(forest, plain, true)).toBe(40);
    expect(salvagedLumber(forest, { ...plain, buildings: ['lumberMill'] }, true)).toBe(160);
    expect(salvagedLumber(makeTile({ base: 'desert', forest: true }), { ...plain, buildings: ['lumberMill'] }, false)).toBe(40);
  });

  it('is doubled for a hardy pioneer and capped by warehouse room', () => {
    expect(clearAt(colonyAtXY(pioneer(2, 1, true), 3, 2)).lumber).toBe(40);
    expect(clearAt(colonyAtXY(pioneer(2, 1), 3, 2, { goods: { lumber: 95 } })).lumber).toBe(100);
    expect(clearAt(colonyAtXY(pioneer(2, 1), 3, 2, { goods: { lumber: 100 } })).lumber).toBe(100);
    expect(clearAt(colonyAtXY(pioneer(2, 1, true), 3, 2, { goods: { lumber: 190 }, buildings: ['warehouse'] })).lumber).toBe(200);
    const plain: Colony = { id: 'c', owner: 'a', name: 'c', x: 0, y: 0, goods: {}, buildings: [], colonists: [], founded: 0, exports: [], hammers: 0, construction: null, sol: { n: 0, d: 100 }, solLevel: 0, toryNoticed: false };
    expect(warehouseCapacity(plain)).toBe(100);
    expect(warehouseCapacity({ ...plain, buildings: ['warehouse'] })).toBe(200);
    expect(warehouseCapacity({ ...plain, buildings: ['warehouse', 'warehouseExpansion'] })).toBe(300);
  });

  it('needs an own colony in range; plowing and roads give none', () => {
    expect(clearAt(colonyAtXY(pioneer(2, 1), 6, 2)).lumber).toBe(0); // 4 away
    expect(clearAt(colonyAtXY(pioneer(2, 1), 5, 2)).lumber).toBe(20); // 3 away
    expect(clearAt(colonyAtXY(pioneer(2, 1), 3, 2, { owner: 'b' })).lumber).toBe(0);
    const road = workUntilDone(colonyAtXY(pioneer(2, 1), 3, 2), 'road');
    expect(road.state.colonies['col']?.goods.lumber ?? 0).toBe(0);
    const r = workUntilDone(colonyAtXY(pioneer(1, 1), 3, 2), 'plow');
    expect(r.state.colonies['col']?.goods.lumber ?? 0).toBe(0);
  });

  it('announces the grant', () => {
    let s = act(colonyAtXY(pioneer(2, 1, true), 3, 2), { type: 'pioneerWork', unitId: 'p', job: 'plow' });
    s = endRound(s);
    const last = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(last.events).toContainEqual({ type: 'lumberSalvaged', colonyId: 'col', amount: 40 });
    expect(last.events).toContainEqual({ type: 'tileImproved', x: 2, y: 1, improvement: 'cleared', unitId: 'p' });
  });
});
