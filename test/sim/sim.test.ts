import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD } from '../../src/engine/data/mapgen';
import { applyAction } from '../../src/engine/actions';
import { createGame } from '../../src/engine/game';
import { checkInvariants } from '../../src/engine/invariants';
import type { Colonist } from '../../src/engine/state';
import { isWater } from '../../src/engine/tile';
import { withColony } from '../helpers/world';
import { runSim } from './run';

// Slow simulations only run with SIM=1 so the default `npm test` stays fast.
describe.skipIf(!process.env['SIM'])('headless simulation', () => {
  it('1 seed x 50 turns with the placeholder AI holds every invariant', () => {
    const result = runSim({ seed: 1, players: 4, turns: 50 });
    expect(result.state.turn).toBe(50);
    expect(result.actions).toBeGreaterThan(50 * 4);
    expect(result.events['turnAdvanced']).toBe(50);
  });

  it('4 powers x 50 turns on a generated world: ships sail, units land, nothing ends up on an illegal tile', () => {
    const result = runSim({ seed: 2, players: 4, turns: 50, world: DEFAULT_WORLD });
    expect(result.state.turn).toBe(50);
    expect(result.events['unitMoved']).toBeGreaterThan(100);
    expect(result.events['shipSailed'] ?? 0).toBeGreaterThan(0);
    expect(result.events['unitLanded'] ?? 0).toBeGreaterThan(0);
  });

  it('runs to 1800 and ends with a scoring event', () => {
    const result = runSim({ seed: 3, players: 2, turns: 1000 });
    expect(result.state.over).toEqual({ reason: 'retired', turn: 508, player: 'ai0' });
    expect(result.events['gameEnded']).toBe(1);
    expect(result.events['turnAdvanced']).toBe(508);
  });

  it('300 turns with only the natives moving: nothing breaks, and a tribe at war raids', () => {
    let state = createGame({ seed: 5, scenario: 'america', players: [{ id: 'c', name: 'C', kind: 'ai' }] });
    // two farming colonies beside a settlement of a tribe that is kept at war with their owner
    const village = Object.values(state.settlements).find((v) => {
      const free = (x: number, y: number): boolean => {
        const t = state.map.tiles[y * state.map.width + x];
        return t !== undefined && !isWater(t) && t.relief === 'flat' && !Object.values(state.settlements).some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1);
      };
      return free(v.x + 3, v.y) && free(v.x - 3, v.y);
    })!;
    const farmers = (prefix: string): Colonist[] => [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy], i) => ({ id: `${prefix}${i}`, profession: 'freeColonist' as const, job: { kind: 'field' as const, dx: dx!, dy: dy!, good: 'food' as const }, turns: 0 }));
    state = withColony(state, { id: 'east', owner: 'c', x: village.x + 3, y: village.y, name: 'East', colonists: farmers('e'), goods: { furs: 100, cloth: 100 } });
    state = withColony(state, { id: 'west', owner: 'c', x: village.x - 3, y: village.y, name: 'West', colonists: farmers('w'), goods: { furs: 100, cloth: 100 } });
    const counts: Record<string, number> = {};
    for (let turn = 0; turn < 300; turn++) {
      const record = state.tribes[village.tribe]!;
      state = { ...state, tribes: { ...state.tribes, [village.tribe]: { ...record, met: ['c'], alarm: { ...record.alarm, c: 100 } } } };
      const result = applyAction(state, { type: 'endTurn' });
      state = result.state;
      for (const e of result.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(state.turn).toBe(300);
    expect(counts['battle']).toBeGreaterThan(10);
    expect(counts['colonyRaided']).toBeGreaterThan(3);
    expect(counts['braveRaised']).toBeGreaterThan(5);
    expect(Object.keys(state.settlements).length).toBeGreaterThan(40);
  });

  it('is deterministic per seed', () => {
    const a = runSim({ seed: 7, players: 2, turns: 20 });
    expect(runSim({ seed: 7, players: 2, turns: 20 })).toEqual(a);
    expect(runSim({ seed: 8, players: 2, turns: 20 }).state).not.toEqual(a.state);
  });
});
