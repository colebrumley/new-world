import { describe, expect, it } from 'vitest';
import { applyAction, InvalidActionError, listValidActions, validateAction, type Action } from '../../../src/engine/actions';
import { createGame } from '../../../src/engine/game';
import { createRng } from '../../../src/engine/rng';
import type { GameState, Unit } from '../../../src/engine/state';
import { deepFreeze } from '../../helpers/freeze';

const TWO = [
  { id: 'a', name: 'A', kind: 'human' },
  { id: 'b', name: 'B', kind: 'ai' },
] as const;

const jsonClone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function withUnit(state: GameState, patch: Partial<Unit>): GameState {
  const unit = { ...(state.units['u1'] as Unit), ...patch };
  return { ...state, units: { ...state.units, u1: unit } };
}

describe('GameState', () => {
  it('is plain JSON at creation and deterministic per seed', () => {
    const s = createGame({ seed: 1, players: TWO });
    expect(jsonClone(s)).toEqual(s);
    expect(createGame({ seed: 1, players: TWO })).toEqual(s);
    expect(createGame({ seed: 2, players: TWO })).not.toEqual(s);
    expect(Object.values(s.units).map((u) => u.owner)).toEqual(['a', 'b']);
  });

  it.each([11, 22, 33])('stays JSON round-trippable across 50 random valid actions (seed %i)', (seed) => {
    const rng = createRng(seed);
    let state = deepFreeze(createGame({ seed, players: TWO }));
    let moves = 0;
    for (let i = 0; i < 50; i++) {
      const options = listValidActions(state);
      // bias away from endTurn so units actually move
      // settling down would take the only unit off the map; keep this run about moving
      const nonEnd = options.filter((a) => a.type === 'moveUnit');
      const action: Action = nonEnd.length > 0 && rng.chance(0.7) ? rng.pick(nonEnd) : { type: 'endTurn' };
      if (action.type === 'moveUnit') moves++;
      const before = jsonClone(state);
      const result = applyAction(state, action);
      expect(state).toEqual(before); // input untouched
      expect(result.events.length).toBeGreaterThan(0);
      state = deepFreeze(result.state);
      expect(jsonClone(state)).toEqual(state);
      expect(JSON.stringify(state)).not.toContain('undefined');
    }
    expect(moves).toBeGreaterThan(5);
    expect(state.turn).toBeGreaterThan(0);
  });
});

describe('applyAction', () => {
  const base = deepFreeze(withUnit(createGame({ seed: 5, players: TWO }), { x: 5, y: 5 }));

  it('moves a unit, spends its move, and shares untouched structure', () => {
    const { state, events } = applyAction(base, { type: 'moveUnit', unitId: 'u1', dx: 1, dy: -1 });
    expect(state.units['u1']).toMatchObject({ x: 6, y: 4, movesLeft: 0, orders: 'none' });
    expect(events[0]).toEqual({ type: 'unitMoved', unitId: 'u1', from: [5, 5], to: [6, 4] });
    expect(events.slice(1).map((e) => e.type)).toEqual(['tilesExplored']);
    expect(state.players).toBe(base.players);
    expect(state.units['u2']).toBe(base.units['u2']);
    expect(base.units['u1']).toMatchObject({ x: 5, y: 5, movesLeft: 3 });
  });

  it('endTurn rotates players, restores moves, and advances the turn on wrap', () => {
    const moved = applyAction(base, { type: 'moveUnit', unitId: 'u1', dx: 1, dy: 0 }).state;
    const r1 = applyAction(moved, { type: 'endTurn' });
    expect(r1.state.current).toBe(1);
    expect(r1.state.turn).toBe(0);
    expect(r1.events).toEqual([{ type: 'playerTurnStarted', player: 'b', turn: 0 }]);
    const r2 = applyAction(r1.state, { type: 'endTurn' });
    expect(r2.state).toMatchObject({ current: 0, turn: 1 });
    expect(r2.events).toEqual([
      { type: 'turnAdvanced', turn: 1 },
      { type: 'playerTurnStarted', player: 'a', turn: 1 },
    ]);
    expect(r2.state.units['u1']?.movesLeft).toBe(3);
  });

  it('disbands a unit', () => {
    const { state, events } = applyAction(base, { type: 'disbandUnit', unitId: 'u1' });
    expect(Object.keys(state.units)).toEqual(['u2']);
    expect(events).toEqual([{ type: 'unitDisbanded', unitId: 'u1', owner: 'a' }]);
  });

  const invalid: [string, GameState, Action, string][] = [
    ['unknown unit', base, { type: 'moveUnit', unitId: 'nope', dx: 1, dy: 0 }, 'noSuchUnit'],
    ["another player's unit", base, { type: 'moveUnit', unitId: 'u2', dx: 1, dy: 0 }, 'notYourUnit'],
    ["disbanding another player's unit", base, { type: 'disbandUnit', unitId: 'u2' }, 'notYourUnit'],
    ['zero step', base, { type: 'moveUnit', unitId: 'u1', dx: 0, dy: 0 }, 'badDirection'],
    ['long step', base, { type: 'moveUnit', unitId: 'u1', dx: 2, dy: 0 }, 'badDirection'],
    ['fractional step', base, { type: 'moveUnit', unitId: 'u1', dx: 0.5, dy: 0 }, 'badDirection'],
    ['into water', deepFreeze(withUnit(base, { x: 2, y: 2 })), { type: 'moveUnit', unitId: 'u1', dx: -1, dy: 0 }, 'impassable'],
    ['off the map', deepFreeze(withUnit(base, { x: 0, y: 0 })), { type: 'moveUnit', unitId: 'u1', dx: -1, dy: 0 }, 'offMap'],
    ['no moves left', deepFreeze(withUnit(base, { movesLeft: 0 })), { type: 'moveUnit', unitId: 'u1', dx: 1, dy: 0 }, 'noMovesLeft'],
    ['unknown action type', base, { type: 'teleport' } as unknown as Action, 'unknownAction'],
  ];

  it.each(invalid)('rejects %s and leaves the input untouched', (_name, state, action, code) => {
    const before = jsonClone(state);
    const v = validateAction(state, action);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.code).toBe(code);
    let thrown: unknown;
    try {
      applyAction(state, action);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(InvalidActionError);
    expect((thrown as InvalidActionError).code).toBe(code);
    expect(state).toEqual(before);
  });

  it('listValidActions only offers actions that validate', () => {
    for (const a of listValidActions(base)) expect(validateAction(base, a).ok).toBe(true);
    expect(listValidActions(base).filter((a) => a.type === 'moveUnit')).toHaveLength(8);
    expect(listValidActions(withUnit(base, { movesLeft: 0 }))).toEqual([{ type: 'endTurn' }, { type: 'foundColony', unitId: 'u1' }]);
  });
});
