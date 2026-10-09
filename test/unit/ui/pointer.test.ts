import { describe, expect, it } from 'vitest';
import type { Unit } from '../../../src/engine/state';
import { WHEEL_STEP, mapClick, mapDrag, unitsToPick, wheelStep } from '../../../src/ui/pointer';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~', '~.....~', '~.....~', '~.....~', '~~~~~~~'];
const base = (): ReturnType<typeof world> => {
  let s = world({ rows: ROWS });
  s = withUnit(s, { id: 'u1', x: 2, y: 2 });
  s = withUnit(s, { id: 'u2', x: 4, y: 2, orders: 'sentry' });
  s = withUnit(s, { id: 'u10', x: 4, y: 2 });
  s = withUnit(s, { id: 'u3', x: 3, y: 1, owner: 'b' });
  s = withUnit(s, { id: 'u4', x: 2, y: 2 });
  return s;
};
const unit = (s: ReturnType<typeof world>, id: string): Unit => s.units[id] as Unit;

describe('map clicks', () => {
  it('in Go To targeting a click is the destination, whatever stands there', () => {
    const s = base();
    expect(mapClick(s, 'a', unit(s, 'u1'), 'goto', { x: 4, y: 2 })).toEqual({ kind: 'goto', x: 4, y: 2 });
  });

  it('selects our units on the square, in id order, leaving out the active one', () => {
    const s = base();
    expect(unitsToPick(s, 'a', 4, 2).map((u) => u.id)).toEqual(['u2', 'u10']);
    expect(mapClick(s, 'a', unit(s, 'u1'), 'move', { x: 4, y: 2 })).toEqual({ kind: 'select', unitIds: ['u2', 'u10'] });
    // the active unit's own square offers whoever else stands there
    expect(mapClick(s, 'a', unit(s, 'u1'), 'move', { x: 2, y: 2 })).toEqual({ kind: 'select', unitIds: ['u4'] });
    expect(mapClick(s, 'a', unit(s, 'u1'), 'view', { x: 4, y: 2 }).kind).toBe('select');
  });

  it('does not offer units that are carried or belong to someone else', () => {
    let s = base();
    s = withUnit(s, { id: 'u20', x: 5, y: 3, aboard: 'u21' });
    expect(unitsToPick(s, 'a', 5, 3)).toEqual([]);
    expect(unitsToPick(s, 'a', 3, 1)).toEqual([]);
  });

  it('steps the active unit to a square beside it, also onto a stranger, but only in move mode', () => {
    const s = base();
    expect(mapClick(s, 'a', unit(s, 'u1'), 'move', { x: 1, y: 1 })).toEqual({ kind: 'step', dx: -1, dy: -1 });
    expect(mapClick(s, 'a', unit(s, 'u1'), 'move', { x: 3, y: 1 })).toEqual({ kind: 'step', dx: 1, dy: -1 });
    expect(mapClick(s, 'a', unit(s, 'u1'), 'view', { x: 1, y: 1 })).toEqual({ kind: 'center', x: 1, y: 1 });
    expect(mapClick(s, 'a', null, 'move', { x: 1, y: 1 })).toEqual({ kind: 'center', x: 1, y: 1 });
  });

  it('centres on a square farther off, and on an empty square under the active unit', () => {
    const s = base();
    expect(mapClick(s, 'a', unit(s, 'u1'), 'move', { x: 5, y: 3 })).toEqual({ kind: 'center', x: 5, y: 3 });
    expect(mapClick(s, 'a', unit(s, 'u10'), 'move', { x: 5, y: 3 }).kind).toBe('step');
    const alone = withUnit(world({ rows: ROWS }), { id: 'u1', x: 2, y: 2 });
    expect(mapClick(alone, 'a', unit(alone, 'u1'), 'move', { x: 2, y: 2 })).toEqual({ kind: 'center', x: 2, y: 2 });
  });

  it('opens our colony rather than selecting or stepping; a foreign colony is stepped at like any square', () => {
    let s = base();
    s = withColony(s, { id: 'c1', x: 3, y: 2, owner: 'a' });
    s = withColony(s, { id: 'c2', x: 1, y: 2, owner: 'b' });
    expect(mapClick(s, 'a', unit(s, 'u1'), 'move', { x: 3, y: 2 })).toEqual({ kind: 'colony', colonyId: 'c1' });
    expect(mapClick(s, 'a', unit(s, 'u1'), 'move', { x: 1, y: 2 })).toEqual({ kind: 'step', dx: -1, dy: 0 });
  });
});

describe('dragging the active unit', () => {
  it('is one step to a square beside it, a Go To farther off, and nothing on its own square or off the map', () => {
    const s = base();
    const u = unit(s, 'u1');
    expect(mapDrag(u, { x: 3, y: 3 })).toEqual({ kind: 'step', dx: 1, dy: 1 });
    expect(mapDrag(u, { x: 5, y: 1 })).toEqual({ kind: 'goto', x: 5, y: 1 });
    expect(mapDrag(u, { x: 2, y: 2 })).toEqual({ kind: 'none' });
    expect(mapDrag(u, null)).toEqual({ kind: 'none' });
  });
});

describe('the wheel', () => {
  it('zooms in when turned away, out when turned toward, one step per full turn', () => {
    expect(wheelStep(0, -WHEEL_STEP)).toEqual({ kept: 0, step: 1 });
    expect(wheelStep(0, WHEEL_STEP)).toEqual({ kept: 0, step: -1 });
    expect(wheelStep(0, WHEEL_STEP * 3)).toEqual({ kept: 0, step: -1 });
  });

  it('adds up the small events of a trackpad, and forgets them when the direction changes', () => {
    let kept = 0;
    const steps: number[] = [];
    for (let i = 0; i < 10; i++) {
      const turned = wheelStep(kept, -30);
      kept = turned.kept;
      steps.push(turned.step);
    }
    expect(steps).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
    expect(wheelStep(-60, 30)).toEqual({ kept: 30, step: 0 });
  });
});
