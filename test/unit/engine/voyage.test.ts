import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action } from '../../../src/engine/actions';
import { VOYAGE } from '../../../src/engine/data/europe';
import { checkInvariants } from '../../../src/engine/invariants';
import { OFF_MAP, type GameState, type Unit } from '../../../src/engine/state';
import { arrivalSquare } from '../../../src/engine/voyage';
import { deepFreeze } from '../../helpers/freeze';
import { withUnit, world } from '../../helpers/world';

// x: 0123456789
const SEA = [
  '~~~~~~~~~~',
  '~~..~~~sss',
  '~~..~~~sss',
  '~~..~~~sss',
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
const endRound = (s: GameState): GameState => act(act(s, { type: 'endTurn' }), { type: 'endTurn' });
const fleet = (seed: number | string = 1, extraShips = 0, fathers: string[] = []): GameState => {
  let s = world({ rows: SEA, seed, players: [{ id: 'a', fathers }, { id: 'b' }] });
  s = withUnit(s, { id: 'ship', type: 'caravel', x: 7, y: 2 });
  s = withUnit(s, { id: 'c', x: 7, y: 2, aboard: 'ship', orders: 'sentry' });
  for (let i = 0; i < extraShips; i++) s = withUnit(s, { id: `x${i}`, type: 'caravel', x: 5, y: 1 + i });
  return s;
};

describe('the sail-for-Europe question', () => {
  it('is raised by an eastward step from Sea Lane to Sea Lane', () => {
    const s = fleet();
    for (const dy of [-1, 0, 1]) expect(code(s, { type: 'moveUnit', unitId: 'ship', dx: 1, dy })).toBe('needsSailChoice');
    // declining still makes the ordinary move
    const stayed = act(s, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: false });
    expect(u(stayed, 'ship')).toMatchObject({ x: 8, y: 2, voyage: null, movesLeft: 9 });
  });

  it('is not raised going north, south or west on the lane, nor entering the lane from open ocean', () => {
    const s = fleet();
    expect(code(s, { type: 'moveUnit', unitId: 'ship', dx: 0, dy: 1 })).toBe('ok');
    expect(code(s, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0 })).toBe('ok');
    const inner = withUnit(s, { id: 'ship', type: 'caravel', x: 6, y: 2 });
    expect(code(inner, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('ok');
    const west = withUnit(s, { id: 'ship', type: 'caravel', x: 8, y: 2 });
    expect(code(west, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0 })).toBe('ok');
  });

  it('is raised by stepping off either side of the map, where declining cancels the move', () => {
    const east = withUnit(fleet(), { id: 'ship', type: 'caravel', x: 8, y: 2 });
    expect(code(east, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('needsSailChoice');
    expect(code(east, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: false })).toBe('offMap');
    const west = withUnit(fleet(), { id: 'ship', type: 'caravel', x: 1, y: 2 });
    expect(code(west, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0 })).toBe('needsSailChoice');
    const gone = act(west, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0, sail: true });
    expect(u(gone, 'ship').voyage).toMatchObject({ phase: 'toEurope', origin: [1, 2] });
    // land units are simply stopped at the edge
    const walker = withUnit(fleet(), { id: 'w', x: 2, y: 2 });
    expect(code(walker, { type: 'moveUnit', unitId: 'w', dx: -1, dy: 0 })).toBe('impassable');
  });

  it('a ship under Go To orders is not asked', () => {
    const s = act(fleet(), { type: 'goTo', unitId: 'ship', x: 8, y: 3 });
    expect(u(s, 'ship')).toMatchObject({ x: 8, y: 3, voyage: null });
  });

  it('listValidActions offers both answers', () => {
    const offered = listValidActions(fleet()).filter((a) => a.type === 'moveUnit' && a.unitId === 'ship' && a.dx === 1 && a.dy === 0);
    expect(offered).toEqual([
      { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: false },
      { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: true },
    ]);
  });
});

describe('the crossing', () => {
  const depart = (s: GameState): GameState => act(s, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: true });

  it('takes ship and passengers off the map and arrives in Europe at the start of the second turn after', () => {
    let s = depart(fleet());
    for (const id of ['ship', 'c']) {
      expect(u(s, id)).toMatchObject({ x: OFF_MAP, y: OFF_MAP, movesLeft: 0 });
      expect(u(s, id).voyage).toEqual({ phase: 'toEurope', turnsLeft: VOYAGE.turns, origin: [7, 2] });
    }
    expect(u(s, 'c').aboard).toBe('ship');
    expect(code(s, { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0 })).toBe('atSea');
    expect(code(s, { type: 'setOrders', unitId: 'ship', orders: 'sentry' })).toBe('atSea');
    expect(code(s, { type: 'sailFromEurope', unitId: 'ship' })).toBe('notInEurope');
    s = endRound(s);
    expect(u(s, 'ship').voyage).toMatchObject({ phase: 'toEurope', turnsLeft: 1 });
    const r = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(r.events).toContainEqual({ type: 'shipReachedEurope', unitId: 'ship' });
    expect(u(r.state, 'ship').voyage).toEqual({ phase: 'inEurope', turnsLeft: 0, origin: [7, 2] });
    expect(u(r.state, 'c').voyage?.phase).toBe('inEurope');
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('comes back the same way to the square it left from, with full movement', () => {
    let s = endRound(endRound(depart(fleet())));
    expect(code(s, { type: 'reverseVoyage', unitId: 'ship' })).toBe('notAtSea');
    expect(code(s, { type: 'sailFromEurope', unitId: 'c' })).toBe('notInEurope'); // passengers do not sail ships
    s = act(s, { type: 'sailFromEurope', unitId: 'ship' });
    expect(u(s, 'ship').voyage).toEqual({ phase: 'toNewWorld', turnsLeft: VOYAGE.turns, origin: [7, 2] });
    s = endRound(s);
    expect(u(s, 'ship').x).toBe(OFF_MAP);
    const r = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(r.events).toContainEqual({ type: 'shipReachedNewWorld', unitId: 'ship', at: [7, 2] });
    expect(u(r.state, 'ship')).toMatchObject({ x: 7, y: 2, voyage: null, movesLeft: 12 });
    expect(u(r.state, 'c')).toMatchObject({ x: 7, y: 2, voyage: null, aboard: 'ship' });
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('an occasional crossing takes a turn longer, but only for a fleet of three or more without Magellan', () => {
    const slowShare = (extraShips: number, fathers: string[]): number => {
      let slow = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const turns = u(depart(fleet(seed, extraShips, fathers)), 'ship').voyage?.turnsLeft;
        expect([VOYAGE.turns, VOYAGE.slowTurns]).toContain(turns);
        if (turns === VOYAGE.slowTurns) slow++;
      }
      return slow / 400;
    };
    expect(slowShare(0, [])).toBe(0);
    expect(slowShare(1, [])).toBe(0);
    const three = slowShare(2, []);
    expect(three).toBeGreaterThan(0.06); // 11 rolls in 100
    expect(three).toBeLessThan(0.17);
    expect(slowShare(2, ['ferdinandMagellan'])).toBe(0);
  });

  it('leaving from the west side is no slower', () => {
    const west = withUnit(fleet(), { id: 'ship', type: 'caravel', x: 1, y: 2 });
    const gone = act(west, { type: 'moveUnit', unitId: 'ship', dx: -1, dy: 0, sail: true });
    expect(u(gone, 'ship').voyage?.turnsLeft).toBe(VOYAGE.turns);
  });

  it('the dice are rolled on every departure so replays stay in step', () => {
    const s = fleet();
    expect(depart(s).rng).not.toEqual(s.rng);
  });
});

describe('turning back', () => {
  it('a ship bound for Europe can be turned around and is back in two turns', () => {
    let s = act(fleet(), { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: true });
    const r = applyAction(s, { type: 'reverseVoyage', unitId: 'ship' });
    expect(r.events).toEqual([{ type: 'shipTurnedBack', unitId: 'ship', to: 'newWorld' }]);
    s = r.state;
    expect(u(s, 'ship').voyage).toEqual({ phase: 'toNewWorld', turnsLeft: VOYAGE.reverseTurns, origin: [7, 2] });
    expect(u(s, 'c').voyage?.phase).toBe('toNewWorld');
    s = endRound(endRound(s));
    expect(u(s, 'ship')).toMatchObject({ x: 7, y: 2, voyage: null });
  });

  it('a ship bound for the New World can be turned back to Europe', () => {
    let s = endRound(endRound(act(fleet(), { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: true })));
    s = endRound(act(s, { type: 'sailFromEurope', unitId: 'ship' }));
    s = act(s, { type: 'reverseVoyage', unitId: 'ship' });
    expect(u(s, 'ship').voyage).toMatchObject({ phase: 'toEurope', turnsLeft: VOYAGE.reverseTurns });
    s = endRound(endRound(s));
    expect(u(s, 'ship').voyage?.phase).toBe('inEurope');
    expect(code(s, { type: 'reverseVoyage', unitId: 'c' })).toBe('notAtSea');
  });
});

describe('arrival square', () => {
  it('is the departure square, or the nearest free Sea Lane square if a foreign unit sits there', () => {
    const s = fleet();
    expect(arrivalSquare(s, 'a', [7, 2])).toEqual([7, 2]);
    const blocked = withUnit(s, { id: 'e', owner: 'b', type: 'privateer', x: 7, y: 2 });
    const at = arrivalSquare(blocked, 'a', [7, 2]);
    expect(at).not.toEqual([7, 2]);
    expect(Math.max(Math.abs(at![0] - 7), Math.abs(at![1] - 2))).toBe(1);
    expect(blocked.map.tiles[at![1] * blocked.map.width + at![0]]?.base).toBe('seaLane');
    // own units do not block
    expect(arrivalSquare(withUnit(s, { id: 'f', type: 'caravel', x: 7, y: 2 }), 'a', [7, 2])).toEqual([7, 2]);
  });

  it('a ship that left from open ocean at the west edge returns to the nearest Sea Lane', () => {
    expect(arrivalSquare(fleet(), 'a', [1, 2])).toEqual([7, 1]);
  });
});
