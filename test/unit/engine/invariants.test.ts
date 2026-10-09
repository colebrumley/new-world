import { describe, expect, it } from 'vitest';
import { createGame } from '../../../src/engine/game';
import { checkInvariants } from '../../../src/engine/invariants';
import type { GameState, Unit } from '../../../src/engine/state';
import { runSim } from '../../sim/run';

const base = createGame({ seed: 1 });
const unit = base.units['u1'] as Unit;
const withUnit = (patch: Partial<Unit>): GameState => ({ ...base, units: { u1: { ...unit, ...patch } } });

describe('checkInvariants', () => {
  it('passes a fresh game', () => {
    expect(checkInvariants(base)).toEqual([]);
  });

  it.each([
    ['unit on water', withUnit({ x: 0, y: 0 }), /impassable/],
    ['unit off the map', withUnit({ x: -1, y: 3 }), /out of bounds/],
    ['unit without an owner', withUnit({ owner: 'ghost' }), /unknown owner/],
    ['negative moves', withUnit({ movesLeft: -1 }), /negative moves/],
    ['fractional gold', { ...base, players: [{ ...base.players[0]!, gold: 1.5 }] }, /not an integer/],
    ['truncated map', { ...base, map: { ...base.map, tiles: base.map.tiles.slice(1) } }, /tiles, expected/],
    ['bad current player', { ...base, current: 4 }, /out of range/],
  ] as [string, GameState, RegExp][])('flags %s', (_name, state, pattern) => {
    expect(checkInvariants(state).join('\n')).toMatch(pattern);
  });
});

describe('runSim (fast smoke; the full run is gated behind SIM=1)', () => {
  it('runs a short game and stops at the turn limit', () => {
    const r = runSim({ seed: 3, players: 2, turns: 3 });
    expect(r.state.turn).toBe(3);
  });
});
