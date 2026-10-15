import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { exploreTarget } from '../../../src/engine/explore-order';
import { checkInvariants } from '../../../src/engine/invariants';
import { isInlandLake } from '../../../src/engine/movement';
import { loadGame } from '../../../src/engine/save';
import { MOVE_THIRDS, type GameState, type Settlement, type Unit } from '../../../src/engine/state';
import { isExploredBy, type Tile } from '../../../src/engine/tile';
import { deepFreeze } from '../../helpers/freeze';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const explore = (s: GameState, unitId = 'x'): { state: GameState; events: readonly GameEvent[] } => applyAction(deepFreeze(s), { type: 'explore', unitId });
const endRound = (s: GameState): { state: GameState; events: GameEvent[] } => {
  const first = applyAction(s, { type: 'endTurn' });
  const second = applyAction(first.state, { type: 'endTurn' });
  return { state: second.state, events: [...first.events, ...second.events] };
};
const known = (s: GameState, x: number, y: number, player = 0): boolean => isExploredBy(s.map.tiles[y * s.map.width + x] as Tile, player);
/** Hide squares from the first power (the second still knows them). */
const fog = (s: GameState, squares: readonly (readonly [number, number])[]): GameState =>
  squares.reduce((acc, [x, y]) => setTile(acc, x, y, { explored: 0b10 }), s);
/** Hide every square matching the test from the first power. */
const fogWhere = (s: GameState, hide: (x: number, y: number) => boolean): GameState => {
  const out: [number, number][] = [];
  for (let y = 0; y < s.map.height; y++) for (let x = 0; x < s.map.width; x++) if (hide(x, y)) out.push([x, y]);
  return fog(s, out);
};
const village = (id: string, x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe: 'sioux', x, y, capital: false, population: settlementPopulation('sioux', false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const withVillage = (s: GameState, v: Settlement): GameState => ({ ...s, settlements: { ...s.settlements, [v.id]: v } });
const moves = (events: readonly GameEvent[]): (readonly [number, number])[] =>
  events.flatMap((e) => (e.type === 'unitMoved' ? [e.to] : []));

// x:  0123456789AB
const PLAIN = [
  '~~~~~~~~~~~~',
  '~..........~',
  '~..........~',
  '~..........~',
  '~..........~',
  '~~~~~~~~~~~~',
];

describe('who may explore', () => {
  const base = withUnit(withUnit(withUnit(world({ rows: PLAIN }), { id: 'x', type: 'scout', x: 2, y: 2 }), { id: 'c', x: 3, y: 3 }), { id: 'theirs', type: 'scout', owner: 'b', x: 8, y: 3 });
  it('refuses a unit that is not a scout or a ship, a tired unit, one on a voyage, a carried scout, and another power\'s', () => {
    expect(code(base, { type: 'explore', unitId: 'c' })).toBe('cannotExplore');
    expect(code(base, { type: 'explore', unitId: 'theirs' })).toBe('notYourUnit');
    expect(code(base, { type: 'explore', unitId: 'nobody' })).toBe('noSuchUnit');
    expect(code(withUnit(base, { id: 'x', type: 'scout', x: 2, y: 2, movesLeft: 0 }), { type: 'explore', unitId: 'x' })).toBe('noMovesLeft');
    const away = { ...base, units: { ...base.units, x: { ...u(base, 'x'), x: -1, y: -1, voyage: { phase: 'inEurope' as const, turnsLeft: 0, origin: [1, 1] as const } } } };
    expect(code(away, { type: 'explore', unitId: 'x' })).toBe('atSea');
    const sea = withUnit(withUnit(world({ rows: PLAIN }), { id: 'ship', type: 'caravel', x: 1, y: 0 }), { id: 'x', type: 'scout', x: 1, y: 0, aboard: 'ship' });
    expect(code(sea, { type: 'explore', unitId: 'x' })).toBe('carried');
    expect(code(base, { type: 'explore', unitId: 'x' })).toBe('ok');
  });

  it('a scout given the order clears any destination and sets off at once with the moves it has', () => {
    let s = fogWhere(base, (x) => x >= 7);
    s = { ...s, units: { ...s.units, x: { ...u(s, 'x'), destination: [5, 5] } } };
    const r = explore(s);
    expect(r.events[0]).toEqual({ type: 'ordersChanged', unitId: 'x', orders: 'explore' });
    expect(u(r.state, 'x')).toMatchObject({ orders: 'explore', destination: null, route: null });
    expect(u(r.state, 'x').x).toBeGreaterThan(2);
    expect(checkInvariants(r.state)).toEqual([]);
  });
});

describe('where an exploring unit goes', () => {
  it('to the cheapest square from which it sees something new; those squares are then explored', () => {
    // unknown country at the east end; the scout sees two squares each way
    const s = fogWhere(withUnit(world({ rows: PLAIN }), { id: 'x', type: 'scout', x: 2, y: 2 }), (x) => x >= 8);
    const target = exploreTarget(s, u(s, 'x'));
    expect(target).toMatchObject({ x: 6, cost: 4 * MOVE_THIRDS });
    const r = explore(s);
    expect(u(r.state, 'x')).toMatchObject({ x: 6, movesLeft: 0, orders: 'explore' });
    for (let y = 0; y <= 4; y++) for (let x = 8; x <= 8; x++) expect(known(r.state, x, y)).toBe(true);
  });

  it('plans over explored squares only: a cheap road it has not seen is not taken', () => {
    // a road runs straight to a rumour, but nobody has seen it; the way round over the plains has been seen
    const rows = [
      '~~~~~~~~~~',
      '~====.~~~~',
      '~.......~~',
      '~~~~~~~~~~',
    ];
    let s = withUnit(world({ rows, seed: 3 }), { id: 'x', type: 'scout', x: 1, y: 1 });
    s = setTile(s, 5, 1, { rumor: true });
    s = fog(s, [[2, 1], [3, 1], [4, 1]]);
    const target = exploreTarget(s, u(s, 'x'));
    expect(target).not.toBeNull();
    for (const [x, y] of target?.steps ?? []) expect(known(s, x, y)).toBe(true);
    // the road would cost a third of a move a step; the scout steps onto the plains instead
    expect(moves(explore(s).events)[0]).toEqual([2, 2]);
  });

  it('a scout goes out of its way for a rumour within reach, stops on it, and the rumour is explored', () => {
    // the frontier is just east; the rumour lies two moves west, inside the preference
    let s = withUnit(world({ rows: PLAIN, seed: 5 }), { id: 'x', type: 'scout', x: 6, y: 2 });
    s = fogWhere(s, (x) => x >= 10);
    s = setTile(s, 4, 2, { rumor: true });
    const r = explore(s);
    expect(r.events.some((e) => e.type === 'rumorExplored' && e.x === 4 && e.y === 2)).toBe(true);
    const scout = r.state.units['x'];
    if (scout) expect(scout).toMatchObject({ x: 4, y: 2, movesLeft: 0, orders: 'explore' });
    expect(r.state.map.tiles[2 * 12 + 4]?.rumor).toBe(false);
  });

  it('a rumour farther off than the preference loses to the frontier', () => {
    let s = withUnit(world({ rows: PLAIN }), { id: 'x', type: 'scout', x: 8, y: 2 });
    s = fogWhere(s, (x) => x >= 10);
    s = setTile(s, 1, 2, { rumor: true });
    expect(exploreTarget(s, u(s, 'x'))).toMatchObject({ x: 9 });
  });

  it('burial mounds leave the question to the player and the order standing; a lost party is gone and moves no more', () => {
    const make = (seed: number, spared: boolean): GameState => {
      let s = withUnit(world({ rows: PLAIN, seed }), { id: 'x', type: 'colonist', x: 6, y: 2 });
      s = { ...s, units: { ...s.units, x: { ...u(s, 'x'), type: 'scout' } } };
      for (const [i, x] of [1, 3, 5].entries()) s = withColony(s, { id: `c${i}`, x, y: 4, colonists: Array.from({ length: 4 }, (_, j) => ({ id: `p${i}${j}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 })) });
      s = { ...s, rumors: { explored: 10, cibolas: 0 }, players: s.players.map((p) => (p.id === 'a' ? { ...p, rumorLossSpared: spared } : p)) };
      s = fogWhere(s, (x) => x >= 10);
      return setTile(s, 5, 2, { rumor: true });
    };
    const outcome = (r: { events: readonly GameEvent[] }): string | undefined => {
      const e = r.events.find((x) => x.type === 'rumorExplored');
      return e && e.type === 'rumorExplored' ? e.outcome : undefined;
    };
    let burial = false;
    let vanished = false;
    for (let seed = 0; seed < 3000 && !(burial && vanished); seed++) {
      if (!burial) {
        const r = explore(make(seed, false));
        if (outcome(r) === 'burial') {
          burial = true;
          expect(r.state.players[0]?.pendingBurial).toMatchObject({ unitId: 'x', x: 5, y: 2 });
          expect(u(r.state, 'x')).toMatchObject({ orders: 'explore', x: 5, y: 2 });
        }
      }
      if (!vanished) {
        const r = explore(make(seed, true));
        if (outcome(r) === 'vanished') {
          vanished = true;
          expect(r.state.units['x']).toBeUndefined();
          const after = r.events.findIndex((e) => e.type === 'rumorExplored');
          expect(r.events.slice(after + 1).some((e) => e.type === 'unitMoved' || e.type === 'exploreDone')).toBe(false);
          expect(checkInvariants(r.state)).toEqual([]);
        }
      }
    }
    expect([burial, vanished]).toEqual([true, true]);
  });
});

describe('one burial question at a time', () => {
  it('while one waits, a scout neither aims for a rumour nor steps onto one', () => {
    let s = withUnit(world({ rows: PLAIN }), { id: 'x', type: 'scout', x: 6, y: 2 });
    s = fogWhere(s, (x) => x >= 10);
    s = setTile(s, 5, 2, { rumor: true });
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, pendingBurial: { unitId: 'y', x: 1, y: 1, q: 50, skill: 1 } } : p)) };
    expect(exploreTarget(s, u(s, 'x'))).toMatchObject({ x: 8 });
    const r = explore(s);
    expect(r.events.some((e) => e.type === 'rumorExplored')).toBe(false);
    expect(r.state.players[0]?.pendingBurial).toMatchObject({ unitId: 'y' });
    // the only way on lies over the rumour: the scout waits
    const lane = fogWhere(withUnit(setTile(world({ rows: ['~~~~~~~~', '~......~', '~~~~~~~~'] }), 3, 1, { rumor: true }), { id: 'x', type: 'scout', x: 1, y: 1 }), (x) => x >= 6);
    const waiting = { ...lane, players: lane.players.map((p) => (p.id === 'a' ? { ...p, pendingBurial: { unitId: 'y', x: 1, y: 1, q: 50, skill: 1 } } : p)) };
    const stuck = explore(waiting);
    expect(u(stuck.state, 'x')).toMatchObject({ x: 2, orders: 'explore' });
    expect(stuck.state.map.tiles[1 * 8 + 3]?.rumor).toBe(true);
    // with nothing else left, the rumour keeps the order standing until the question is answered
    const known = setTile(withUnit(world({ rows: PLAIN }), { id: 'x', type: 'scout', x: 6, y: 2 }), 2, 2, { rumor: true });
    const held = { ...known, players: known.players.map((p) => (p.id === 'a' ? { ...p, pendingBurial: { unitId: 'y', x: 1, y: 1, q: 50, skill: 1 } } : p)) };
    const r2 = explore(held);
    expect(u(r2.state, 'x')).toMatchObject({ orders: 'explore', x: 6, y: 2 });
    expect(r2.events.some((e) => e.type === 'exploreDone')).toBe(false);
    const answered = applyAction(r2.state, { type: 'answerBurial', search: false }).state;
    expect(u(endRound(answered).state, 'x')).toMatchObject({ x: 2, y: 2 });
  });
});

describe('chiefs', () => {
  const beside = (extra: Partial<Settlement> = {}, alarm = 0, seed = 1): GameState => {
    let s = withUnit(world({ rows: PLAIN, seed }), { id: 'x', type: 'scout', x: 3, y: 2 });
    s = withVillage(s, village('v', 4, 2, extra));
    s = { ...s, tribes: { ...s.tribes, sioux: { ...s.tribes.sioux!, alarm: { a: alarm } } } };
    return fogWhere(s, (x) => x >= 10);
  };
  const spoke = (r: { events: readonly GameEvent[] }): boolean => r.events.some((e) => e.type === 'chiefSpoke');

  it('a scout beside a settlement nobody has visited speaks with the chief, which spends its moves', () => {
    let checked = false;
    for (let seed = 1; seed < 200 && !checked; seed++) {
      const r = explore(beside({}, 0, seed));
      const said = r.events.find((e) => e.type === 'chiefSpoke');
      expect(said).toBeDefined();
      if (!said || said.type !== 'chiefSpoke' || said.outcome === 'nothing' || said.outcome === 'killed') continue;
      expect(u(r.state, 'x')).toMatchObject({ movesLeft: 0, orders: 'explore', x: 3, y: 2 });
      expect(r.state.settlements['v']?.scouted).toEqual(['a']);
      expect(r.events.some((e) => e.type === 'tributeDemanded' || e.type === 'battle')).toBe(false);
      checked = true;
    }
    expect(checked).toBe(true);
  });

  it('does not go back to a chief it has spoken with, even when he said nothing', () => {
    let checked = false;
    for (let seed = 1; seed < 400 && !checked; seed++) {
      const r = explore(beside({}, 40, seed));
      const said = r.events.find((e) => e.type === 'chiefSpoke');
      if (!said || said.type !== 'chiefSpoke' || said.outcome !== 'nothing' || !r.state.units['x']) continue;
      expect(r.state.settlements['v']?.scouted).toEqual([]);
      expect(u(r.state, 'x').heard).toEqual(['v']);
      const next = endRound(r.state);
      expect(next.events.some((e) => e.type === 'chiefSpoke')).toBe(false);
      expect(u(next.state, 'x').x).toBeGreaterThan(3);
      checked = true;
    }
    expect(checked).toBe(true);
  });

  it('it heads for such a settlement as for a rumour', () => {
    let s = withUnit(world({ rows: PLAIN }), { id: 'x', type: 'scout', x: 7, y: 2 });
    s = withVillage(s, village('v', 2, 2));
    s = fogWhere(s, (x) => x >= 10);
    const r = explore(s);
    expect(u(r.state, 'x').x).toBe(3);
    expect(spoke(r)).toBe(false); // it arrived with nothing left to speak with
    const next = endRound(r.state);
    expect(spoke(next)).toBe(true);
  });

  it('never where somebody has spoken with the chief already, nor where the tribe is Angry or the settlement at War', () => {
    expect(spoke(explore(beside({ scouted: ['b'] })))).toBe(false);
    expect(spoke(explore(beside({}, 80)))).toBe(false);
    expect(spoke(explore(beside({ alarm: { a: 200 } })))).toBe(false);
    for (const s of [beside({ scouted: ['b'] }), beside({}, 80)]) expect(u(explore(s).state, 'x').x).toBeGreaterThan(3);
  });
});

describe('ships', () => {
  // x: 0123456789AB
  const SEA = [
    '~~~~~~~~~~~~',
    '~~~....~~ss~',
    '~~~.~~.~~ss~',
    '~~~.....~ss~',
    '~~~~~~~~~ss~',
    '~~~~~~~~~ss~',
    '~~~~~~~~~~~~',
  ];
  it('explores the open sea with cargo and passengers aboard, never sailing for Europe or into a lake, and wakes when done', () => {
    let s = withUnit(world({ rows: SEA, seed: 2 }), { id: 'x', type: 'merchantman', x: 2, y: 5, cargo: { furs: 50 } });
    s = withUnit(s, { id: 'p', x: 2, y: 5, aboard: 'x', orders: 'sentry' });
    s = fogWhere(s, (x, y) => x >= 6 || y <= 1);
    expect(isInlandLake(s.map, 4, 2)).toBe(true);
    let r = explore(s);
    const seen: GameEvent[] = [...r.events];
    for (let round = 0; round < 8 && u(r.state, 'x').orders === 'explore'; round++) {
      r = endRound(r.state);
      seen.push(...r.events);
    }
    const ship = u(r.state, 'x');
    expect(ship.voyage).toBeNull();
    expect(ship.cargo).toEqual({ furs: 50 });
    expect(u(r.state, 'p')).toMatchObject({ aboard: 'x', x: ship.x, y: ship.y });
    for (const [x, y] of moves(seen)) expect(isInlandLake(r.state.map, x, y)).toBe(false);
    expect(seen.some((e) => e.type === 'shipSailed')).toBe(false);
    // it did go out along the Sea Lane, and came back from it
    expect(moves(seen).some(([x]) => x >= 9)).toBe(true);
    // and left no open water unseen (the rim behind the headland cannot be seen from the sea)
    const unseen: [number, number][] = [];
    for (let y = 1; y < SEA.length - 1; y++) for (let x = 1; x < 11; x++) if (!known(r.state, x, y) && (SEA[y] as string)[x] !== '.') unseen.push([x, y]);
    expect(unseen).toEqual([]);
    expect(ship.orders).toBe('none');
    expect(seen).toContainEqual({ type: 'exploreDone', unitId: 'x', x: ship.x, y: ship.y });
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('never enters a foreign colony', () => {
    let s = withUnit(world({ rows: SEA }), { id: 'x', type: 'caravel', x: 2, y: 5 });
    s = withColony(s, { id: 'theirs', owner: 'b', x: 3, y: 3 });
    s = fogWhere(s, (x) => x >= 6);
    const target = exploreTarget(s, u(s, 'x'));
    for (const [x, y] of target?.steps ?? []) expect([x, y]).not.toEqual([3, 3]);
  });
});

describe('turns, waking and replay', () => {
  const strip = (): GameState => {
    const rows = ['~'.repeat(30), `~${'.'.repeat(28)}~`, `~${'.'.repeat(28)}~`, '~'.repeat(30)];
    return fogWhere(withUnit(world({ rows }), { id: 'x', type: 'scout', x: 1, y: 1 }), (x) => x >= 5);
  };

  it('moves again with its full moves at the start of each of its owner\'s turns', () => {
    const first = explore(strip()).state;
    const at = u(first, 'x').x;
    expect(u(first, 'x').movesLeft).toBe(0);
    const later = endRound(first);
    expect(u(later.state, 'x').x).toBeGreaterThan(at);
    expect(u(later.state, 'x').orders).toBe('explore');
  });

  it('wakes with nothing left to explore, and says where', () => {
    const s = withUnit(world({ rows: PLAIN }), { id: 'x', type: 'scout', x: 2, y: 2 });
    const r = explore(s);
    expect(u(r.state, 'x')).toMatchObject({ orders: 'none', x: 2, y: 2 });
    expect(r.events).toContainEqual({ type: 'exploreDone', unitId: 'x', x: 2, y: 2 });
  });

  it('wakes at the start of its turn when an enemy stands beside it', () => {
    let s = strip();
    s = { ...s, units: { ...s.units, x: { ...u(s, 'x'), orders: 'explore' } } };
    s = withUnit(s, { id: 'foe', type: 'soldier', owner: 'b', x: 2, y: 2 });
    const stance = (with_: 'peace' | 'war'): GameState => ({ ...s, players: s.players.map((p) => ({ ...p, stance: { [p.id === 'a' ? 'b' : 'a']: with_ } })) });
    const peace = endRound(stance('peace')).state;
    expect(u(peace, 'x').orders).toBe('explore');
    expect(u(peace, 'x').x).toBeGreaterThan(1);
    const war = stance('war');
    const woken = endRound(war).state;
    expect(u(woken, 'x')).toMatchObject({ orders: 'none', x: 1, y: 1 });
  });

  it('the same actions give the same moves', () => {
    const run = (): GameState => endRound(endRound(explore(strip()).state).state).state;
    expect(run()).toEqual(run());
  });

  it('an old save still loads', () => {
    const text = readFileSync(join(import.meta.dirname, '../../fixtures/saves/v1.json'), 'utf8');
    expect(() => loadGame(text)).not.toThrow();
  });
});
