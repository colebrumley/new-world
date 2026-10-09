import { describe, expect, it } from 'vitest';
import type { Unit } from '../../../src/engine/state';
import { sidebarModel, unitLabel, formatMoves } from '../../../src/ui/sidebar';
import { needsOrders, nextUnit, orderLetter, topUnit } from '../../../src/ui/unit-queue';
import { withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~~~~~~'];
const base = (): ReturnType<typeof world> => {
  let s = world({ rows: ROWS });
  s = withUnit(s, { id: 'u1', x: 1, y: 1 });
  s = withUnit(s, { id: 'u2', x: 2, y: 1 });
  s = withUnit(s, { id: 'u3', x: 3, y: 1, orders: 'sentry' });
  s = withUnit(s, { id: 'u4', x: 4, y: 1, movesLeft: 0 });
  s = withUnit(s, { id: 'u5', x: 1, y: 2, owner: 'b' });
  s = withUnit(s, { id: 'u10', x: 2, y: 2 });
  return s;
};
const ids = (u: Unit | null): string | null => u?.id ?? null;

describe('unit queue', () => {
  it('asks only units that can still act and have no standing orders', () => {
    const s = base();
    expect(Object.values(s.units).filter((u) => needsOrders(u, 'a')).map((u) => u.id)).toEqual(['u1', 'u2', 'u10']);
  });

  it('goes round in id order (numerically) and wraps', () => {
    const s = base();
    const none = new Set<string>();
    expect(ids(nextUnit(s, 'a', null, none))).toBe('u1');
    expect(ids(nextUnit(s, 'a', 'u1', none))).toBe('u2');
    expect(ids(nextUnit(s, 'a', 'u2', none))).toBe('u10');
    expect(ids(nextUnit(s, 'a', 'u10', none))).toBe('u1');
    expect(ids(nextUnit(s, 'b', null, none))).toBe('u5');
    expect(nextUnit(world({ rows: ROWS }), 'a', null, none)).toBeNull();
  });

  it('passes over waiting units until they are all that is left', () => {
    const s = base();
    expect(ids(nextUnit(s, 'a', 'u1', new Set(['u1'])))).toBe('u2');
    expect(ids(nextUnit(s, 'a', 'u2', new Set(['u1', 'u2'])))).toBe('u10');
    expect(ids(nextUnit(s, 'a', 'u10', new Set(['u1', 'u2', 'u10'])))).toBe('u1');
    const one = withUnit(world({ rows: ROWS }), { id: 'u1', x: 1, y: 1 });
    expect(ids(nextUnit(one, 'a', 'u1', new Set(['u1'])))).toBe('u1');
  });

  it('gives each order its letter', () => {
    const s = base();
    const letter = (orders: Unit['orders']): string => orderLetter({ ...(s.units['u1'] as Unit), orders });
    expect((['none', 'sentry', 'goto', 'fortify', 'fortified', 'plow', 'road'] as const).map(letter)).toEqual(['-', 'S', 'G', 'F', 'F', 'P', 'R']);
  });

  it('shows the active unit on top of a stack, never a carried one', () => {
    let s = withUnit(world({ rows: ROWS }), { id: 'ship', type: 'caravel', x: 0, y: 0 });
    s = withUnit(s, { id: 'c', x: 0, y: 0, aboard: 'ship' });
    s = withUnit(s, { id: 'd', type: 'dragoon', x: 0, y: 0 });
    const stack = Object.values(s.units);
    expect(ids(topUnit(stack, null))).toBe('ship');
    expect(ids(topUnit(stack, 'd'))).toBe('d');
    expect(ids(topUnit(stack, 'c'))).toBe('ship');
    expect(topUnit([], null)).toBeNull();
  });
});

describe('sidebar model', () => {
  it('names units by skill and role, and writes movement in thirds', () => {
    const s = base();
    const u = s.units['u1'] as Unit;
    expect(unitLabel(u)).toBe('Free Colonist');
    expect(unitLabel({ ...u, profession: 'expertFarmer' })).toBe('Expert Farmer');
    expect(unitLabel({ ...u, type: 'soldier' })).toBe('Soldier');
    expect(unitLabel({ ...u, type: 'soldier', profession: 'veteranSoldier' })).toBe('Veteran Soldier');
    expect(unitLabel({ ...u, type: 'pioneer', profession: 'hardyPioneer' })).toBe('Hardy Pioneer');
    expect(unitLabel({ ...u, type: 'caravel', profession: null })).toBe('Caravel');
    expect([0, 1, 2, 3, 4, 12].map(formatMoves)).toEqual(['0', '1/3', '2/3', '1', '1 1/3', '4']);
  });

  it('describes the active unit, what it carries, its square, and the status line', () => {
    let s = withUnit(world({ rows: ROWS }), { id: 'ship', type: 'caravel', x: 0, y: 1, cargo: { furs: 60 }, orders: 'sentry' });
    s = withUnit(s, { id: 'p', type: 'pioneer', x: 0, y: 1, aboard: 'ship', profession: 'hardyPioneer' });
    const m = sidebarModel(s, s.units['ship'] as Unit, { x: 0, y: 1 }, false, 'hello');
    expect(m).toMatchObject({
      date: '1492', treasury: '0 gold', unit: 'Caravel', moves: 'Moves: 4', orders: 'Sentry', location: '(0, 1)', terrain: 'Ocean', status: 'hello',
    });
    expect(m.aboard).toEqual(['Hardy Pioneer', '60 Furs']);
    expect(sidebarModel(s, s.units['p'] as Unit, { x: 0, y: 1 }).aboard).toEqual(['100 Tools']);
    const idle = sidebarModel(s, null, null);
    expect(idle).toMatchObject({ unit: 'No active unit', moves: '', orders: '', location: '', terrain: '' });
  });
});
