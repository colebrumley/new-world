import { describe, expect, it } from 'vitest';
import { playTurn } from '../../src/ai/european';
import { applyAction, validateAction, type GameEvent } from '../../src/engine/actions';
import { totalGoods } from '../../src/engine/cargo';
import { DEFAULT_WORLD } from '../../src/engine/data/mapgen';
import { GOOD_IDS } from '../../src/engine/data/goods';
import { NATION_IDS } from '../../src/engine/data/nations';
import { createGame } from '../../src/engine/game';
import { checkInvariants } from '../../src/engine/invariants';
import { loadGame, saveGame } from '../../src/engine/save';
import type { GameState } from '../../src/engine/state';
import { tally } from './run';

/**
 * A game on the eve of a Declaration, as a save: four powers have played `turns` turns, and the
 * first of them (a human's seat) has been given colonies firmly for independence.
 */
export function eveOfIndependence(seed: number, turns = 120): string {
  const options = { seed, world: DEFAULT_WORLD, players: NATION_IDS.map((nation, i) => ({ id: nation, name: nation, kind: i === 0 ? ('human' as const) : ('ai' as const), nation })) };
  let state = createGame(options);
  while (state.turn < turns || state.current !== 0) state = playTurn(state).state;
  const colonies = Object.fromEntries(Object.values(state.colonies).map((c) => [c.id, c.owner === 'england' ? { ...c, sol: { n: 4 * c.sol.d, d: 5 * c.sol.d } } : c]));
  return saveGame({ options, log: [], state: { ...state, colonies } });
}

/** Play a war out from a prepared state with the computer policy for the rebels; the ledger and invariants are checked at every action. */
function fight(start: GameState, seed: number, turns: number): { state: GameState; seen: Record<string, number> } {
  let state = start;
  const goods = totalGoods(state);
  const seen: Record<string, number> = {};
  const step = (events: readonly GameEvent[]): void => {
    tally(goods, events, state);
    for (const e of events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    const problems = [...checkInvariants(state)];
    const now = totalGoods(state);
    for (const good of GOOD_IDS) if (now[good] !== goods[good]) problems.push(`${good} changed from ${goods[good]} to ${now[good]}`);
    if (problems.length > 0) throw new Error(`seed ${seed}, turn ${state.turn}: ${problems.join('; ')}`);
  };
  const declared = applyAction(state, { type: 'declareIndependence' });
  state = declared.state;
  step(declared.events);
  const until = state.turn + turns;
  while (state.turn < until && !state.over) {
    for (const action of playTurn(state).actions) {
      if (state.over) break;
      const result = applyAction(state, action);
      state = result.state;
      step(result.events);
    }
  }
  return { state, seen };
}

describe.skipIf(!process.env['SIM'])('a War of Independence from a saved game', () => {
  it.each([11, 12, 13])('seed %i: the Declaration and the war keep every invariant and the goods ledger', (seed) => {
    const start: GameState = loadGame(eveOfIndependence(seed)).state;
    // (the English grow one colony large before they found another, so one or two is what they have by now)
    expect(Object.values(start.colonies).filter((c) => c.owner === 'england').length).toBeGreaterThanOrEqual(1);
    expect(validateAction(start, { type: 'declareIndependence' }).ok).toBe(true);
    const { state, seen } = fight(start, seed, 40);
    expect(state.players.filter((p) => !p.withdrawn).map((p) => p.id)).toEqual(['england']);
    expect(seen['independenceDeclared']).toBe(1);
    expect(seen['refLanded']).toBeGreaterThan(1);
    expect(seen['battle']).toBeGreaterThan(0);
  });

  it.each([11, 12, 13])('seed %i: left as they are, the rebels are put down', (seed) => {
    const { state, seen } = fight(loadGame(eveOfIndependence(seed)).state, seed, 150);
    expect(state.over).toMatchObject({ reason: 'crownVictory', player: 'england' });
    expect(seen['colonyCaptured']).toBeGreaterThan(0);
  });

  it.each([11, 12, 13])('seed %i: well fortified and against a small expedition, they win their independence', (seed) => {
    let start: GameState = loadGame(eveOfIndependence(seed)).state;
    // every English colony a fortress with guns and veterans in it, and the King's force cut to a remnant
    const colonies = { ...start.colonies };
    const units = { ...start.units };
    let nextId = start.nextId;
    for (const c of Object.values(start.colonies)) {
      if (c.owner !== 'england') continue;
      colonies[c.id] = { ...c, buildings: [...new Set([...c.buildings, 'stockade', 'fort', 'fortress'] as const)], goods: { ...c.goods, food: 500 } };
      for (const type of ['artillery', 'artillery', 'artillery', 'continentalArmy', 'continentalArmy', 'continentalArmy', 'continentalArmy'] as const) {
        const id = `u${nextId++}`;
        units[id] = { id, owner: 'england', type, profession: type === 'artillery' ? null : 'veteranSoldier', x: c.x, y: c.y, aboard: null, orders: 'fortified', destination: null, movesLeft: 0, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null };
      }
    }
    start = { ...start, colonies, units, nextId, players: start.players.map((p) => (p.id === 'england' ? { ...p, ref: { regulars: 3, cavalry: 0, artillery: 0, ships: 1 } } : p)) };
    const { state, seen } = fight(start, seed, 150);
    expect(state.over).toMatchObject({ reason: 'independence', player: 'england' });
    expect(seen['refBeaten']).toBe(1);
  });
});
