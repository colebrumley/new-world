import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { checkInvariants } from '../../../src/engine/invariants';
import { fullMoves, isBorder, isInlandLake, landStepCost, routeFor } from '../../../src/engine/movement';
import type { GameState, Unit } from '../../../src/engine/state';
import { deepFreeze } from '../../helpers/freeze';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const move = (s: GameState, unitId: string, dx: number, dy: number, landfall?: boolean): GameState =>
  applyAction(deepFreeze(s), landfall ? { type: 'moveUnit', unitId, dx, dy, landfall } : { type: 'moveUnit', unitId, dx, dy }).state;
const endRound = (s: GameState): GameState => applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' }).state;

// x: 0123456789
const LAND = [
  '~~~~~~~~~~',
  '~.fhm.w=~~',
  '~..rr.W=~~',
  '~.....a=~~',
  '~~~~~~~~~~',
];

describe('movement points', () => {
  it('counts in thirds: a unit starts each turn with moves x 3', () => {
    const s = withUnit(withUnit(world({ rows: LAND }), { id: 'c', x: 1, y: 1 }), { id: 'd', type: 'dragoon', x: 1, y: 2 });
    expect(fullMoves(u(s, 'c'))).toBe(3);
    expect(fullMoves(u(s, 'd'))).toBe(12);
  });

  it('charges the terrain cost of the tile entered', () => {
    const s = world({ rows: LAND });
    expect(landStepCost(s, 1, 2, 1, 1)).toBe(3); // plains
    expect(landStepCost(s, 1, 1, 2, 1)).toBe(6); // mixed forest
    expect(landStepCost(s, 2, 1, 3, 1)).toBe(6); // hills
    expect(landStepCost(s, 3, 1, 4, 1)).toBe(9); // mountains
    expect(landStepCost(s, 5, 1, 6, 1)).toBe(6); // swamp
    expect(landStepCost(s, 5, 2, 6, 2)).toBe(9); // rain forest
    expect(landStepCost(s, 5, 3, 6, 3)).toBe(6); // arctic
  });

  it('charges one third along a road, only when both ends have one; a colony counts as road', () => {
    const s = world({ rows: LAND });
    expect(landStepCost(s, 7, 1, 7, 2)).toBe(1);
    expect(landStepCost(s, 6, 1, 7, 1)).toBe(3); // onto a road from off-road: plains cost
    expect(landStepCost(s, 7, 1, 6, 1)).toBe(6); // off the road into swamp
    const c = withColony(s, { id: 'col', x: 6, y: 2 });
    expect(landStepCost(c, 7, 2, 6, 2)).toBe(1);
    expect(landStepCost(c, 6, 2, 7, 1)).toBe(1);
  });

  it('follows a river for one third, but only straight along it, and never pays more than one move to enter a settlement', () => {
    const s = world({ rows: LAND });
    expect(landStepCost(s, 3, 2, 4, 2)).toBe(1); // river to river, east
    expect(landStepCost(s, 3, 2, 2, 2)).toBe(3); // off the river
    const bend = setTile(s, 4, 1, { river: 'major' }); // the mountain square
    expect(landStepCost(bend, 4, 2, 4, 1)).toBe(1); // straight north along the river, even into mountains
    expect(landStepCost(bend, 3, 2, 4, 1)).toBe(9); // diagonal: full terrain cost
    expect(landStepCost(withColony(s, { id: 'col', x: 4, y: 1 }), 5, 1, 4, 1)).toBe(3); // colony on mountains
    expect(landStepCost(withColony(s, { id: 'col', x: 1, y: 1 }), 1, 2, 1, 1)).toBe(3);
  });

  it('a dragoon rides four plains tiles, or two forest tiles, in a turn', () => {
    let s = withUnit(world({ rows: ['~~~~~~~~', '~......~', '~ffff..~', '~~~~~~~~'] }), { id: 'd', type: 'dragoon', x: 1, y: 1 });
    for (let i = 0; i < 4; i++) s = move(s, 'd', 1, 0);
    expect(u(s, 'd')).toMatchObject({ x: 5, movesLeft: 0 });
    expect(code(s, { type: 'moveUnit', unitId: 'd', dx: 1, dy: 0 })).toBe('noMovesLeft');
    let f = withUnit(world({ rows: ['~~~~~~~~', '~......~', '~ffff..~', '~~~~~~~~'] }), { id: 'd', type: 'dragoon', x: 1, y: 2 });
    f = move(f, 'd', 1, 0);
    f = move(f, 'd', 1, 0);
    expect(u(f, 'd')).toMatchObject({ x: 3, movesLeft: 0 });
  });

  it('nine road tiles cost a colonist its single move', () => {
    const rows = ['~~~~~~~~~~~~', '~==========~', '~~~~~~~~~~~~'];
    let s = withUnit(world({ rows }), { id: 'c', x: 1, y: 1 });
    for (let i = 0; i < 3; i++) s = move(s, 'c', 1, 0);
    expect(u(s, 'c')).toMatchObject({ x: 4, movesLeft: 0 });
  });
});

describe('land unit limits', () => {
  const base = withUnit(withUnit(world({ rows: LAND }), { id: 'c', x: 1, y: 1 }), { id: 'e', owner: 'b', x: 2, y: 2 });

  it('cannot enter water, the border, or a square held by another power', () => {
    expect(code(base, { type: 'moveUnit', unitId: 'c', dx: 0, dy: -1 })).toBe('offMap');
    expect(code(base, { type: 'moveUnit', unitId: 'c', dx: 1, dy: 1 })).toBe('occupied');
    const inland = withUnit(world({ rows: ['~~~~~', '~~~~~', '~~.~~', '~~~~~', '~~~~~'] }), { id: 'c', x: 2, y: 2 });
    expect(code(inland, { type: 'moveUnit', unitId: 'c', dx: 1, dy: 0 })).toBe('impassable');
    expect(isBorder(base.map, 0, 2)).toBe(true);
    expect(isBorder(base.map, 1, 1)).toBe(false);
    const foreign = withColony(base, { id: 'x', owner: 'b', x: 1, y: 2 });
    expect(code(foreign, { type: 'moveUnit', unitId: 'c', dx: 0, dy: 1 })).toBe('occupied');
  });

  it('may share a square with its own side; there is no zone of control', () => {
    const s = withUnit(base, { id: 'c2', x: 1, y: 2 });
    expect(code(s, { type: 'moveUnit', unitId: 'c', dx: 0, dy: 1 })).toBe('ok');
    // stepping between two squares that both touch the foreign unit is fine
    const beside = withUnit(base, { id: 'c3', x: 1, y: 3 });
    expect(code(beside, { type: 'moveUnit', unitId: 'c3', dx: 1, dy: 0 })).toBe('ok');
  });
});

describe('short of movement', () => {
  it('a unit with some movement left may try a costlier square; failing costs the rest of its turn', () => {
    const rows = ['~~~~~', '~=.m~', '~=..~', '~~~~~'];
    let made = 0;
    let failed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      // one third left after two road steps is not on offer here, so start with a third in hand
      const s = withUnit(world({ rows, seed }), { id: 'c', x: 2, y: 1, movesLeft: 1 });
      expect(code(s, { type: 'moveUnit', unitId: 'c', dx: 1, dy: 0 })).toBe('ok');
      const r = applyAction(s, { type: 'moveUnit', unitId: 'c', dx: 1, dy: 0 });
      const after = u(r.state, 'c');
      expect(after.movesLeft).toBe(0);
      if (after.x === 3) made++;
      else {
        failed++;
        expect(r.events).toEqual([{ type: 'moveFailed', unitId: 'c', to: [3, 1] }]);
        expect(r.state.rng).not.toEqual(s.rng);
      }
    }
    // one third in hand against a cost of nine thirds: about one try in nine succeeds
    expect(made).toBeGreaterThan(8);
    expect(made).toBeLessThan(45);
    expect(failed).toBeGreaterThan(150);
  });

  it('a unit that has not moved yet this turn always gets its first step, whatever it costs', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = withUnit(world({ rows: ['~~~~~', '~=.m~', '~=..~', '~~~~~'], seed }), { id: 'c', x: 2, y: 1 });
      const r = applyAction(s, { type: 'moveUnit', unitId: 'c', dx: 1, dy: 0 });
      expect(u(r.state, 'c')).toMatchObject({ x: 3, movesLeft: 0 });
      expect(r.state.rng).toBe(s.rng);
    }
  });

  it('a unit that can pay in full always moves and the dice are not touched', () => {
    const s = withUnit(world({ rows: LAND }), { id: 'c', x: 1, y: 1 });
    const r = applyAction(s, { type: 'moveUnit', unitId: 'c', dx: 0, dy: 1 });
    expect(u(r.state, 'c')).toMatchObject({ y: 2, movesLeft: 0 });
    expect(r.state.rng).toBe(s.rng);
  });
});

// x: 0123456789
const COAST = [
  '~~~~~~~~~~',
  '~~~~..~~~~',
  '~~~~..~.~~',
  '~~~~..~~~~',
  '~~~~~~~~~~',
];

describe('ships', () => {
  const sea = withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', x: 2, y: 2 });

  it('sail one move per square and stay on the water', () => {
    const s = move(sea, 'ship', 0, 1);
    expect(u(s, 'ship')).toMatchObject({ x: 2, y: 3, movesLeft: 9 });
    expect(code(sea, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('ok');
    expect(code(move(sea, 'ship', 1, 0), { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('impassable');
    expect(code(sea, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0 })).toBe('ok');
    // off the side of the map is the way to Europe: the move asks, and declining goes nowhere
    const edge = move(sea, 'ship', -1, 0);
    expect(code(edge, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0 })).toBe('needsSailChoice');
    expect(code(edge, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0, sail: false })).toBe('offMap');
    expect(code(edge, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: -1, sail: false })).toBe('offMap');
    expect(code(move(sea, 'ship', 0, -1), { type: 'moveUnit', unitId: 'ship', dx: 0, dy: -1 })).toBe('offMap'); // north is just ice
  });

  it('cannot enter an inland lake', () => {
    const lake = setTile(setTile(world({ rows: ['~~~~~~~', '~.....~', '~..~..~', '~.....~', '~~~~~~~'] }), 0, 0, {}), 0, 0, {});
    expect(isInlandLake(lake.map, 3, 2)).toBe(true);
    expect(isInlandLake(lake.map, 1, 0)).toBe(false);
    expect(isInlandLake(lake.map, 1, 1)).toBe(false);
    // a ship in a colony on the lake shore still cannot put out onto the lake
    const port = withUnit(withColony(lake, { id: 'col', x: 2, y: 2 }), { id: 'ship', type: 'caravel', x: 2, y: 2 });
    expect(code(port, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('lake');
  });

  it('may enter and leave their own coastal colony, not a foreign one', () => {
    const port = withColony(sea, { id: 'col', x: 4, y: 2 });
    let s = move(sea, 'ship', 1, 0);
    expect(code(s, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('impassable');
    s = withUnit(withColony(s, { id: 'col', x: 4, y: 2 }), { id: 'p', x: 3, y: 2, aboard: 'ship', orders: 'sentry' });
    s = move(s, 'ship', 1, 0);
    // docking ends the ship's turn and wakes whoever is aboard
    expect(u(s, 'ship')).toMatchObject({ x: 4, y: 2, movesLeft: 0 });
    expect(u(s, 'p')).toMatchObject({ x: 4, y: 2, orders: 'none', aboard: 'ship' });
    expect(code(s, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 1 })).toBe('noMovesLeft');
    expect(checkInvariants(s)).toEqual([]);
    s = move(endRound(s), 'ship', -1, 1);
    expect(u(s, 'ship')).toMatchObject({ x: 3, y: 3 });
    const foreign = withColony(move(port, 'ship', 1, 0), { id: 'col', owner: 'b', x: 4, y: 2 });
    expect(code(foreign, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('impassable');
  });

  it('carry their passengers along', () => {
    const s = move(withUnit(sea, { id: 'c', x: 2, y: 2, aboard: 'ship' }), 'ship', 0, -1);
    expect(u(s, 'c')).toMatchObject({ x: 2, y: 1, aboard: 'ship' });
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('boarding and landing', () => {
  const loaded = withUnit(withUnit(withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', x: 3, y: 2 }), { id: 'c1', x: 3, y: 2, aboard: 'ship', orders: 'sentry' }), {
    id: 'c2', type: 'soldier', x: 3, y: 2, aboard: 'ship', orders: 'sentry',
  });

  it('a loaded ship moved onto land asks for landfall, which wakes the passengers and leaves the ship where it is', () => {
    expect(code(loaded, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('needsLandfall');
    const r = applyAction(loaded, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, landfall: true });
    expect(u(r.state, 'ship')).toMatchObject({ x: 3, y: 2, movesLeft: 12 });
    for (const id of ['c1', 'c2']) expect(u(r.state, id)).toMatchObject({ x: 3, y: 2, aboard: 'ship', orders: 'none' });
    expect(r.events).toEqual([{ type: 'unitWoken', unitId: 'c1' }, { type: 'unitWoken', unitId: 'c2' }]);
    // each then marches ashore under its own orders, which ends its turn
    const ashore = move(move(r.state, 'c1', 1, 0), 'c2', 1, 0);
    for (const id of ['c1', 'c2']) expect(u(ashore, id)).toMatchObject({ x: 4, y: 2, aboard: null, movesLeft: 0 });
    expect(checkInvariants(ashore)).toEqual([]);
  });

  it('there is no landfall to make once every passenger has spent its turn', () => {
    const tired = { ...loaded, units: { ...loaded.units, c1: { ...u(loaded, 'c1'), movesLeft: 0 }, c2: { ...u(loaded, 'c2'), movesLeft: 0 } } };
    expect(code(tired, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, landfall: true })).toBe('impassable');
  });

  it('an empty ship cannot make landfall', () => {
    const empty = withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', x: 3, y: 2 });
    expect(code(empty, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, landfall: true })).toBe('impassable');
  });

  it('a single passenger can go ashore by itself, which ends its turn', () => {
    const s = move(loaded, 'c1', 1, -1);
    expect(u(s, 'c1')).toMatchObject({ x: 4, y: 1, aboard: null, movesLeft: 0 });
    expect(u(s, 'c2')).toMatchObject({ aboard: 'ship' });
    expect(code(loaded, { type: 'moveUnit', unitId: 'c1', dx: -1, dy: 0 })).toBe('impassable');
  });

  it('units cannot go ashore onto a square another power holds', () => {
    const held = withUnit(loaded, { id: 'e', owner: 'b', x: 4, y: 2 });
    expect(code(held, { type: 'moveUnit', unitId: 'c1', dx: 1, dy: 0 })).toBe('landFirst');
    expect(code(held, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, landfall: true })).toBe('landFirst');
    expect(code(held, { type: 'moveUnit', unitId: 'c1', dx: 1, dy: 1 })).toBe('ok');
  });

  it('a land unit boards a ship by stepping onto it from the shore, until the holds are full', () => {
    let s = withUnit(withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', x: 3, y: 2 }), { id: 'c1', x: 4, y: 2 });
    const r = applyAction(s, { type: 'moveUnit', unitId: 'c1', dx: -1, dy: 0 });
    expect(u(r.state, 'c1')).toMatchObject({ x: 3, y: 2, aboard: 'ship', movesLeft: 0, orders: 'sentry' });
    expect(r.events).toEqual([{ type: 'unitBoarded', unitId: 'c1', carrierId: 'ship' }]);
    s = withUnit(withUnit(r.state, { id: 'c2', x: 4, y: 1 }), { id: 'c3', x: 4, y: 3 });
    s = move(s, 'c2', -1, 1);
    expect(code(s, { type: 'moveUnit', unitId: 'c3', dx: -1, dy: -1 })).toBe('shipFull');
    expect(checkInvariants(s)).toEqual([]);
    // no ship there: plain water
    expect(code(s, { type: 'moveUnit', unitId: 'c3', dx: -1, dy: 0 })).toBe('impassable');
    // someone else's ship is not a ride
    const foreign = withUnit(withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', owner: 'b', x: 3, y: 2 }), { id: 'c1', x: 4, y: 2 });
    expect(code(foreign, { type: 'moveUnit', unitId: 'c1', dx: -1, dy: 0 })).toBe('impassable');
  });

  it('sentried units in a colony go aboard when a ship leaves, as far as there is room', () => {
    let s = withColony(world({ rows: COAST }), { id: 'col', x: 4, y: 2 });
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 4, y: 2 });
    s = withUnit(s, { id: 's1', x: 4, y: 2, orders: 'sentry' });
    s = withUnit(s, { id: 's2', x: 4, y: 2, orders: 'sentry' });
    s = withUnit(s, { id: 's3', x: 4, y: 2, orders: 'sentry' });
    s = withUnit(s, { id: 'idle', x: 4, y: 2 });
    const out = move(s, 'ship', -1, 0);
    expect(['s1', 's2', 's3', 'idle'].map((id) => u(out, id).aboard)).toEqual(['ship', 'ship', null, null]);
    expect(u(out, 's1')).toMatchObject({ x: 3, y: 2 });
    expect(u(out, 's3')).toMatchObject({ x: 4, y: 2 });
    expect(checkInvariants(out)).toEqual([]);
  });

  it('boarding from a colony costs one move; from open shore it costs the whole turn', () => {
    let s = withColony(world({ rows: COAST }), { id: 'col', x: 4, y: 2 });
    s = withUnit(withUnit(s, { id: 'ship', type: 'caravel', x: 3, y: 2 }), { id: 'd', type: 'dragoon', x: 4, y: 2 });
    expect(u(move(s, 'd', -1, 0), 'd')).toMatchObject({ aboard: 'ship', movesLeft: 9 });
    const shore = withUnit(withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', x: 3, y: 2 }), { id: 'd', type: 'dragoon', x: 4, y: 2 });
    expect(u(move(shore, 'd', -1, 0), 'd')).toMatchObject({ aboard: 'ship', movesLeft: 0 });
  });

  it('a unit aboard a ship docked in a colony just walks out', () => {
    let s = withColony(world({ rows: COAST }), { id: 'col', x: 4, y: 2 });
    s = withUnit(withUnit(s, { id: 'ship', type: 'caravel', x: 4, y: 2 }), { id: 'd', type: 'dragoon', x: 4, y: 2, aboard: 'ship' });
    const out = move(s, 'd', 1, 0);
    expect(u(out, 'd')).toMatchObject({ x: 5, y: 2, aboard: null, movesLeft: 9 });
  });

  it('a unit aboard a carrier in a colony can step ashore there, which wakes it and costs nothing', () => {
    let s = withColony(world({ rows: COAST }), { id: 'col', x: 4, y: 2 });
    s = withUnit(withUnit(s, { id: 'ship', type: 'caravel', x: 4, y: 2 }), { id: 'p', x: 4, y: 2, aboard: 'ship', orders: 'sentry', movesLeft: 0 });
    const r = applyAction(deepFreeze(s), { type: 'goAshore', unitId: 'p' });
    expect(u(r.state, 'p')).toMatchObject({ x: 4, y: 2, aboard: null, orders: 'none', movesLeft: 0 });
    expect(r.events).toEqual([{ type: 'unitLanded', unitId: 'p', carrierId: 'ship', to: [4, 2] }]);
    expect(checkInvariants(r.state)).toEqual([]);
    expect(code(r.state, { type: 'goAshore', unitId: 'p' })).toBe('notAboard');
    // at sea there is no quay to step onto
    const atSea = withUnit(withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', x: 3, y: 2 }), { id: 'p', x: 3, y: 2, aboard: 'ship' });
    expect(code(atSea, { type: 'goAshore', unitId: 'p' })).toBe('noColonyHere');
  });
});

describe('orders', () => {
  const base = withUnit(withUnit(world({ rows: LAND }), { id: 'c', x: 1, y: 1 }), { id: 'e', owner: 'b', x: 5, y: 3 });

  it('Sentry and Activate set and clear orders', () => {
    let r = applyAction(base, { type: 'setOrders', unitId: 'c', orders: 'sentry' });
    expect(u(r.state, 'c').orders).toBe('sentry');
    expect(r.events).toEqual([{ type: 'ordersChanged', unitId: 'c', orders: 'sentry' }]);
    r = applyAction(r.state, { type: 'setOrders', unitId: 'c', orders: 'none' });
    expect(u(r.state, 'c').orders).toBe('none');
    expect(code(base, { type: 'setOrders', unitId: 'e', orders: 'sentry' })).toBe('notYourUnit');
    expect(code(base, { type: 'setOrders', unitId: 'c', orders: 'goto' as 'none' })).toBe('badOrders');
  });

  it('Fortify takes hold at the start of the next turn and is lost by moving', () => {
    let s = applyAction(base, { type: 'setOrders', unitId: 'c', orders: 'fortify' }).state;
    expect(u(s, 'c')).toMatchObject({ orders: 'fortify', movesLeft: 0 }); // digging in ends the turn
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(u(s, 'c').orders).toBe('fortify'); // the other player's turn
    s = applyAction(s, { type: 'endTurn' }).state;
    expect(u(s, 'c').orders).toBe('fortified');
    expect(u(applyAction(s, { type: 'setOrders', unitId: 'c', orders: 'fortify' }).state, 'c').orders).toBe('fortified');
    expect(u(move(s, 'c', 0, 1), 'c').orders).toBe('none');
  });

  it('a sentry wakes when a foreign unit is next to it at the start of its turn', () => {
    let s = applyAction(base, { type: 'setOrders', unitId: 'c', orders: 'sentry' }).state;
    expect(u(endRound(s), 'c').orders).toBe('sentry');
    s = { ...s, units: { ...s.units, e: { ...u(s, 'e'), x: 2, y: 2 } } };
    expect(u(endRound(s), 'c').orders).toBe('none');
  });

  it('Skip ends the unit turn; Disband removes it and whatever it carries', () => {
    expect(u(applyAction(base, { type: 'skipUnit', unitId: 'c' }).state, 'c').movesLeft).toBe(0);
    let s = withUnit(world({ rows: COAST }), { id: 'ship', type: 'caravel', x: 3, y: 2 });
    s = withUnit(s, { id: 'c1', x: 3, y: 2, aboard: 'ship' });
    const r = applyAction(s, { type: 'disbandUnit', unitId: 'ship' });
    expect(Object.keys(r.state.units)).toEqual([]);
    expect(r.events.map((e) => e.type)).toEqual(['unitDisbanded', 'unitDisbanded']);
  });
});

describe('Go To', () => {
  const rows = [
    '~~~~~~~~~~~~',
    '~....m.....~',
    '~....m.....~',
    '~....m.....~',
    '~..........~',
    '~~~~~~~~~~~~',
  ];

  it('walks a multi-turn route around obstacles and clears the order on arrival', () => {
    let s = withUnit(withUnit(world({ rows }), { id: 'c', x: 1, y: 1 }), { id: 'e', owner: 'b', x: 10, y: 4 });
    expect(routeFor(s, u(s, 'c'), 9, 1)?.steps).toHaveLength(8);
    const r = applyAction(s, { type: 'goTo', unitId: 'c', x: 9, y: 1 });
    expect(u(r.state, 'c')).toMatchObject({ orders: 'goto', destination: [9, 1], movesLeft: 0 });
    expect(r.events.map((e) => e.type)).toContain('unitMoved');
    s = r.state;
    let turns = 1;
    while (u(s, 'c').orders === 'goto' && turns < 20) {
      s = endRound(s);
      turns++;
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(u(s, 'c')).toMatchObject({ x: 9, y: 1, orders: 'none', destination: null });
    expect(turns).toBe(8); // one plains step a turn, never over the mountains
  });

  it('a ship ordered to Europe makes for the nearest Sea Lane and sails from it', () => {
    //            0123456789012
    const sea = ['~~~~~~~~~~~~~', '~~~~~~~~~~sss', '~..~~~~~~~sss', '~~~~~~~~~~sss', '~~~~~~~~~~~~~'];
    let s = withUnit(world({ rows: sea }), { id: 'ship', type: 'caravel', x: 3, y: 2 });
    s = withUnit(s, { id: 'p', x: 3, y: 2, aboard: 'ship' });
    s = withUnit(s, { id: 'c', x: 1, y: 2 });
    expect(code(s, { type: 'goToEurope', unitId: 'c' })).toBe('badOrders');
    expect(code(s, { type: 'goToEurope', unitId: 'ship' })).toBe('ok');
    s = applyAction(deepFreeze(s), { type: 'goToEurope', unitId: 'ship' }).state;
    // four squares a turn: short of the lane, still under orders, and not asked whether to sail
    expect(u(s, 'ship')).toMatchObject({ x: 7, y: 2, orders: 'goto', voyage: null });
    expect(checkInvariants(s)).toEqual([]);
    s = endRound(s);
    expect(u(s, 'ship')).toMatchObject({ orders: 'none', destination: null, voyage: { phase: 'toEurope' } });
    expect(u(s, 'ship').voyage?.origin[0]).toBe(10);
    expect(u(s, 'p').voyage).toMatchObject({ phase: 'toEurope' });
    expect(checkInvariants(s)).toEqual([]);
  });

  it('sails at once from the Sea Lane; not while Europe is closed, nor from waters that reach no lane', () => {
    const sea = ['~~~~~~~', '~~~~sss', '~~~~sss', '~~~~~~~'];
    const onLane = withUnit(world({ rows: sea }), { id: 'ship', type: 'caravel', x: 4, y: 1 });
    const r = applyAction(deepFreeze(onLane), { type: 'goToEurope', unitId: 'ship' });
    expect(u(r.state, 'ship').voyage).toMatchObject({ phase: 'toEurope', origin: [4, 1] });
    expect(r.events.map((e) => e.type)).toEqual(['ordersChanged', 'shipSailed']);
    const atWar = withUnit(world({ rows: sea, players: [{ id: 'a', atWar: true }, { id: 'b' }] }), { id: 'ship', type: 'caravel', x: 4, y: 1 });
    expect(code(atWar, { type: 'goToEurope', unitId: 'ship' })).toBe('europeClosed');
    // land between her and the lane, and the map's rim is not sailed
    const cut = withUnit(world({ rows: ['~~~~~~~', '~~~.sss', '~~~.sss', '~~~~~~~'] }), { id: 'ship', type: 'caravel', x: 1, y: 1 });
    expect(code(cut, { type: 'goToEurope', unitId: 'ship' })).toBe('noPath');
  });

  it('ships route by water only, units ashore by land only', () => {
    // the COAST layout with a row of open water north and south, so ships can round the land
    const open = ['~~~~~~~~~~', '~~~~~~~~~~', ...COAST.slice(1, 4), '~~~~~~~~~~', '~~~~~~~~~~'];
    let s = withUnit(world({ rows: open }), { id: 'ship', type: 'caravel', x: 2, y: 3 });
    s = withUnit(s, { id: 'c', x: 4, y: 3 });
    expect(code(s, { type: 'goTo', unitId: 'ship', x: 7, y: 2 })).toBe('ok');
    expect(code(s, { type: 'goTo', unitId: 'ship', x: 4, y: 3 })).toBe('noPath');
    expect(code(s, { type: 'goTo', unitId: 'c', x: 7, y: 3 })).toBe('noPath'); // an island across the strait
    expect(code(s, { type: 'goTo', unitId: 'c', x: 5, y: 4 })).toBe('ok');
    expect(code(s, { type: 'goTo', unitId: 'c', x: 40, y: 2 })).toBe('offMap');
    const sailed = applyAction(s, { type: 'goTo', unitId: 'ship', x: 7, y: 2 }).state;
    expect(u(sailed, 'ship').x).toBeGreaterThan(2);
    expect(u(endRound(sailed), 'ship')).toMatchObject({ x: 7, y: 2, orders: 'none' });
    const carried = withUnit(s, { id: 'p', x: 2, y: 3, aboard: 'ship' });
    expect(code(carried, { type: 'goTo', unitId: 'p', x: 4, y: 2 })).toBe('carried');
  });

  it('a manual move or new orders cancel the Go To', () => {
    const s = withUnit(withUnit(world({ rows }), { id: 'd', type: 'dragoon', x: 1, y: 4 }), { id: 'e', owner: 'b', x: 10, y: 1 });
    const going = applyAction(s, { type: 'goTo', unitId: 'd', x: 10, y: 4 }).state;
    expect(u(going, 'd')).toMatchObject({ x: 5, orders: 'goto' });
    const next = endRound(going);
    expect(u(next, 'd')).toMatchObject({ x: 9, orders: 'goto' });
    const rested = { ...next, units: { ...next.units, d: { ...u(next, 'd'), movesLeft: 3 } } };
    expect(u(move(rested, 'd', 0, -1), 'd')).toMatchObject({ orders: 'none', destination: null });
    expect(u(applyAction(next, { type: 'setOrders', unitId: 'd', orders: 'sentry' }).state, 'd')).toMatchObject({ orders: 'sentry', destination: null });
  });
});
