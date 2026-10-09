import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type GameEvent } from '../../../src/engine/actions';
import { CALENDAR, dateOfTurn, firstTurnOfYear } from '../../../src/engine/calendar';
import type { GameState } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~~~', '~~....~sss', '~~....~sss', '~~....~sss', '~~~~~~~~~~'];
const FOUR = [{ id: 'england' }, { id: 'france' }, { id: 'spain' }, { id: 'netherlands' }];
const end = (s: GameState): { state: GameState; events: readonly GameEvent[] } => applyAction(s, { type: 'endTurn' });
const atTurn = (s: GameState, turn: number, current = 0): GameState => ({ ...s, turn, current });

describe('calendar landmarks', () => {
  it('finds the first turn of a year on both sides of 1600', () => {
    expect(firstTurnOfYear(1492)).toBe(0);
    expect(firstTurnOfYear(1599)).toBe(107);
    expect(firstTurnOfYear(1600)).toBe(108);
    expect(firstTurnOfYear(1601)).toBe(110);
    expect(firstTurnOfYear(1800)).toBe(508);
    expect(firstTurnOfYear(1850)).toBe(608);
    for (const year of [1492, 1550, 1600, 1700, 1800, 1850]) {
      expect(dateOfTurn(firstTurnOfYear(year)).year).toBe(year);
      if (year > 1492) expect(dateOfTurn(firstTurnOfYear(year) - 1).year).toBe(year - 1);
    }
    expect(CALENDAR).toMatchSnapshot();
  });
});

describe('player order', () => {
  it('goes England, France, Spain, Netherlands, and the date moves on after the last', () => {
    let s = world({ rows: ROWS, players: FOUR.map((p) => ({ ...p, kind: 'ai' as const })) });
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      seen.push(`${s.turn}:${s.players[s.current]?.id}`);
      const r = end(s);
      const started = r.events.filter((e) => e.type === 'playerTurnStarted');
      expect(started).toHaveLength(1);
      // a new round is announced before the first power moves
      if (r.state.current === 0) expect(r.events.map((e) => e.type).slice(0, 2)).toEqual(['turnAdvanced', 'playerTurnStarted']);
      else expect(r.events.some((e) => e.type === 'turnAdvanced')).toBe(false);
      s = r.state;
    }
    expect(seen).toEqual([
      '0:england', '0:france', '0:spain', '0:netherlands',
      '1:england', '1:france', '1:spain', '1:netherlands', '2:england',
    ]);
  });
});

describe("phases of a power's turn", () => {
  it('runs Europe news before unit orders: a ship arrives, then pioneers work and Go To units move', () => {
    let s = world({ rows: ROWS });
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 7, y: 2 });
    s = withUnit(s, { id: 'p', type: 'pioneer', x: 2, y: 1, profession: 'hardyPioneer' });
    s = withUnit(s, { id: 'w', type: 'dragoon', x: 2, y: 3 });
    s = withUnit(s, { id: 'e', owner: 'b', x: 5, y: 2 });
    s = applyAction(s, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: true }).state;
    s = applyAction(s, { type: 'pioneerWork', unitId: 'p', job: 'plow' }).state; // 2 turns for a hardy pioneer
    s = { ...s, units: { ...s.units, w: { ...s.units['w']!, orders: 'goto', destination: [5, 3] } } };
    s = end(end(s).state).state; // voyage: 1 turn left; plow done; dragoon arrives
    s = withUnit(s, { id: 'p', type: 'pioneer', x: 3, y: 1, profession: 'hardyPioneer', orders: 'road' });
    s = { ...s, units: { ...s.units, w: { ...s.units['w']!, x: 2, y: 3, orders: 'goto', destination: [5, 3] } } };
    const r = end(end(s).state);
    const order = r.events.map((e) => e.type);
    expect(order).toContain('shipReachedEurope');
    expect(order).toContain('tileImproved');
    expect(order).toContain('unitMoved');
    expect(order.indexOf('playerTurnStarted')).toBeLessThan(order.indexOf('shipReachedEurope'));
    expect(order.indexOf('shipReachedEurope')).toBeLessThan(order.indexOf('tileImproved'));
    expect(order.indexOf('tileImproved')).toBeLessThan(order.lastIndexOf('unitMoved'));
  });
});

describe('end of the game', () => {
  const ai = world({ rows: ROWS, players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }] });

  it('ends in 1800 when no War of Independence is being fought', () => {
    const before = atTurn(ai, firstTurnOfYear(1800) - 1, 1);
    expect(end(atTurn(ai, firstTurnOfYear(1800) - 2, 1)).state.over).toBeNull();
    const r = end(before);
    expect(r.state.over).toEqual({ reason: 'retired', turn: 508, player: 'a' });
    expect(r.events).toEqual([
      { type: 'turnAdvanced', turn: 508 },
      { type: 'gameEnded', reason: 'retired', player: 'a', turn: 508, year: 1800 },
    ]);
  });

  it('runs on to 1850 for a power at war, and no further', () => {
    const war = world({ rows: ROWS, players: [{ id: 'a', kind: 'ai', atWar: true }] });
    expect(end(atTurn(war, firstTurnOfYear(1800) - 1)).state.over).toBeNull();
    expect(end(atTurn(war, firstTurnOfYear(1849))).state.over).toBeNull();
    expect(end(atTurn(war, firstTurnOfYear(1850) - 1)).state.over).toEqual({ reason: 'warLost', turn: 608, player: 'a' });
  });

  it('recalls a human player who holds no colony in or after 1600', () => {
    const human = world({ rows: ROWS, players: [{ id: 'a' }] });
    expect(end(atTurn(human, firstTurnOfYear(1599) - 1)).state.over).toBeNull();
    const r = end(atTurn(human, firstTurnOfYear(1600) - 1));
    expect(r.state.over).toEqual({ reason: 'noColonies', turn: 108, player: 'a' });
    expect(r.events.at(-1)).toMatchObject({ type: 'gameEnded', reason: 'noColonies', year: 1600 });
    const settled = withColony(human, { id: 'col', x: 3, y: 2 });
    expect(end(atTurn(settled, firstTurnOfYear(1600) - 1)).state.over).toBeNull();
    expect(end(atTurn(settled, firstTurnOfYear(1700))).state.over).toBeNull();
    // an AI power without colonies is not recalled
    expect(end(atTurn(ai, firstTurnOfYear(1650), 1)).state.over).toBeNull();
  });

  it('accepts no actions once over', () => {
    const over = end(atTurn(ai, firstTurnOfYear(1800) - 1, 1)).state;
    expect(listValidActions(over)).toEqual([]);
    const v = validateAction(over, { type: 'endTurn' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.code).toBe('gameOver');
    expect(() => applyAction(over, { type: 'endTurn' })).toThrow(/ended/);
  });
});
