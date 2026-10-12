import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../../src/engine/actions';
import { checkCheat, type CheatArgValue, type CheatCommand } from '../../../../src/engine/cheats';
import { MAP_SPECS } from '../../../../src/engine/cheats/map';
import { CHEATS } from '../../../../src/engine/data/cheats';
import { revealAround } from '../../../../src/engine/explore';
import type { GameState } from '../../../../src/engine/state';
import { deepFreeze } from '../../../helpers/freeze';
import { world } from '../../../helpers/world';

const ROWS = Array.from({ length: 12 }, (_, y) => (y % 5 === 0 ? '~'.repeat(15) : `~${'.'.repeat(13)}~`));
/** A world nobody has seen any of, but for one square the second power knows. */
function dark(): GameState {
  const lit = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }, { id: 'c', kind: 'ai' }] });
  const tiles = lit.map.tiles.map((t, i) => ({ ...t, explored: i === 0 ? 0b010 : 0 }));
  return deepFreeze({ ...lit, map: { ...lit.map, tiles } });
}
const cheat = (command: CheatCommand, player?: string): Action => (player === undefined ? { type: 'cheat', command } : { type: 'cheat', player, command });
const bits = (state: GameState): number[] => state.map.tiles.map((t) => t.explored);
const reveal = (at: { x: number; y: number } | null, radius: number = CHEATS.revealRadius): CheatCommand => ({ cheat: 'reveal', at, radius });

describe('reveal', () => {
  it('with no square makes every square known to the power, and to no other', () => {
    const state = dark();
    const { state: next, events } = applyAction(state, cheat(reveal(null)));
    expect(bits(next)).toEqual(bits(state).map((b) => b | 0b001));
    expect(next.map.tiles.every((t) => (t.explored & 0b001) !== 0)).toBe(true);
    expect(events).toEqual([{ type: 'cheatApplied', player: 'a', summary: 'Revealed the whole map.' }]);
    // nothing else about the squares changed
    expect(next.map.tiles.map((t) => ({ ...t, explored: 0 }))).toEqual(state.map.tiles.map((t) => ({ ...t, explored: 0 })));
  });

  it('for another power sets that power\'s bit', () => {
    const state = dark();
    const { state: next } = applyAction(state, cheat(reveal(null), 'c'));
    expect(bits(next)).toEqual(bits(state).map((b) => b | 0b100));
    expect(next.players.map((p) => p.cheated)).toEqual([true, undefined, true]);
  });

  it('covers a map taller than it is wide, and wider than it is tall', () => {
    for (const rows of [['~.', '..', '..', '..', '..', '..', '.~'], ['~......~']]) {
      const lit = world({ rows });
      const state: GameState = { ...lit, map: { ...lit.map, tiles: lit.map.tiles.map((t) => ({ ...t, explored: 0 })) } };
      const { state: next } = applyAction(state, cheat(reveal(null)));
      expect(bits(next)).toEqual(bits(state).map(() => 0b01));
    }
  });

  it('with a square and a radius marks exactly the squares revealAround would', () => {
    const state = dark();
    const { state: next, events } = applyAction(state, cheat(reveal({ x: 13, y: 2 }, 2)));
    const want = revealAround(state.map, 0, 13, 2, 2);
    expect(next.map).toEqual(want.map);
    // clipped at the edge of the map: 4 columns by 5 rows
    expect(want.revealed).toHaveLength(20);
    expect(bits(next).filter((b) => b & 1)).toHaveLength(20);
    expect(events).toEqual([{ type: 'cheatApplied', player: 'a', summary: 'Revealed the country within 2 squares of 13,2.' }]);
    const one = applyAction(state, cheat(reveal({ x: 5, y: 5 }, 0)));
    expect(bits(one.state).filter((b) => b & 1)).toHaveLength(1);
    expect(applyAction(state, cheat(reveal({ x: 5, y: 5 }, 1))).events[0]).toMatchObject({ summary: 'Revealed the country within 1 square of 5,5.' });
  });

  it('with a square alone takes the radius from the table', () => {
    const state = dark();
    const spec = MAP_SPECS.find((s) => s.name === 'reveal');
    const command = spec?.build({ square: { x: 6, y: 6 } }) as CheatCommand;
    expect(command).toEqual({ cheat: 'reveal', at: { x: 6, y: 6 }, radius: CHEATS.revealRadius });
    const { state: next } = applyAction(state, cheat(command));
    expect(next.map).toEqual(revealAround(state.map, 0, 6, 6, CHEATS.revealRadius).map);
    const side = 2 * CHEATS.revealRadius + 1;
    expect(bits(next).filter((b) => b & 1)).toHaveLength(side * side);
    expect(spec?.build({})).toEqual({ cheat: 'reveal', at: null, radius: CHEATS.revealRadius });
  });

  it('is refused for a square off the map, and for a radius that is no count', () => {
    const state = dark();
    for (const [x, y] of [[-1, 0], [0, -1], [15, 0], [0, 12], [1.5, 2]] as const) {
      const check = validateAction(state, cheat(reveal({ x, y })));
      expect(check, `${x},${y}`).toEqual({ ok: false, error: { code: 'cheatSquare', message: `there is no square ${x},${y} on the map` } });
    }
    expect(validateAction(state, cheat(reveal({ x: 14, y: 11 }))).ok).toBe(true);
    // a command with no word about where is refused, not taken for the whole map
    for (const at of [undefined, 7]) {
      const check = validateAction(state, cheat({ cheat: 'reveal', at, radius: 1 } as unknown as CheatCommand));
      expect(check, String(at)).toEqual({ ok: false, error: { code: 'cheatSquare', message: 'reveal takes a square, or none for the whole map' } });
    }
    for (const radius of [-1, 0.5, Number.NaN]) {
      const check = validateAction(state, cheat(reveal({ x: 3, y: 3 }, radius)));
      expect(check, String(radius)).toEqual({ ok: false, error: { code: 'cheatAmount', message: 'a radius is a whole number of zero or more' } });
    }
  });

  it('leaves the map as it is when there is nothing new to show', () => {
    const lit = world({ rows: ROWS });
    expect(applyAction(lit, cheat(reveal(null))).state.map).toBe(lit.map);
  });
});

describe('the map specs', () => {
  const ARGS: Record<string, Record<string, CheatArgValue>> = {
    reveal: { square: { x: 2, y: 3 }, radius: 4 },
  };

  it.each(MAP_SPECS.map((s) => [s.name, s] as const))('%s builds a command the check accepts', (name, spec) => {
    const args = ARGS[name];
    if (!args) throw new Error(`no test arguments for the cheat "${name}"`);
    expect(Object.keys(args).sort()).toEqual(spec.args.map((a) => a.name).sort());
    const state = dark();
    const command = spec.build(args);
    expect(checkCheat(state, 'a', command)).toEqual({ ok: true });
    expect(() => applyAction(state, cheat(command))).not.toThrow();
    const required = Object.fromEntries(spec.args.filter((a) => !a.optional).map((a) => [a.name, args[a.name]]));
    expect(checkCheat(state, 'a', spec.build(required))).toEqual({ ok: true });
  });
});
