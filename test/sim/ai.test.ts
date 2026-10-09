import { describe, expect, it } from 'vitest';
import { playTurn } from '../../src/ai/european';
import { navalStations, privateersCarry } from '../../src/ai/navy';
import type { Action, GameEvent } from '../../src/engine/actions';
import { CALENDAR } from '../../src/engine/calendar';
import { DEFAULT_WORLD } from '../../src/engine/data/mapgen';
import { NATION_IDS } from '../../src/engine/data/nations';
import { createGame } from '../../src/engine/game';
import { checkInvariants } from '../../src/engine/invariants';
import type { GameState } from '../../src/engine/state';

export interface AiRun {
  readonly state: GameState;
  readonly coloniesAt100: Readonly<Record<string, number>>;
  readonly slowestTurnMs: number;
  readonly lowestGold: number;
  readonly events: Readonly<Record<string, number>>;
  /** The turn on which each kind of event first happened. */
  readonly firstTurn: Readonly<Record<string, number>>;
  /** Settlements holding a mission when turn 150 was reached. */
  readonly missionsAt150: number;
  /** R-806: privateers sent somewhere that is neither a station nor a home port; and their attacks on ships of powers at peace. */
  readonly privateersAstray: number;
  readonly privateerRaids: number;
}

/** Four computer powers play each other with the European policy; invariants are checked after every power's turn. */
export function runPowers(seed: number, turns: number, america = false): AiRun {
  const players = NATION_IDS.map((nation) => ({ id: nation, name: nation, kind: 'ai' as const, nation }));
  let state = createGame({ seed, players, ...(america ? { scenario: 'america' as const } : { world: DEFAULT_WORLD }) });
  const coloniesAt100: Record<string, number> = {};
  const events: Record<string, number> = {};
  const firstTurn: Record<string, number> = {};
  let missionsAt150 = -1;
  let privateersAstray = 0;
  let privateerRaids = 0;
  const watch = (before: GameState, action: Action, happened: readonly GameEvent[]): void => {
    const unit = 'unitId' in action ? before.units[action.unitId] : undefined;
    const player = before.players[before.current];
    if (!unit || !player || unit.type !== 'privateer') return;
    // (one with passengers to deliver, or pressed into carrying while the ports are beset, is doing a transport's work)
    const carrying = Object.values(before.units).some((u) => u.aboard === unit.id) || privateersCarry(before, player);
    if (action.type === 'goTo' && !carrying) {
      const station = navalStations(before, player).some((s) => s.x === action.x && s.y === action.y);
      const home = Object.values(before.colonies).some((c) => c.owner === player.id && c.x === action.x && c.y === action.y);
      if (!station && !home) privateersAstray++;
    }
    if (action.type === 'attack') {
      const victim = Object.values(before.units).find((v) => v.x === unit.x + action.dx && v.y === unit.y + action.dy && v.owner !== unit.owner);
      if (victim && player.stance[victim.owner] === 'peace' && happened.length > 0) privateerRaids++;
    }
  };
  let slowest = 0;
  let lowestGold = 0;
  while (state.turn < turns && !state.over) {
    const began = performance.now();
    const turn = playTurn(state, undefined, watch);
    slowest = Math.max(slowest, performance.now() - began);
    state = turn.state;
    for (const e of turn.events) {
      events[e.type] = (events[e.type] ?? 0) + 1;
      firstTurn[e.type] ??= state.turn;
    }
    const problems = checkInvariants(state);
    if (problems.length > 0) throw new Error(`seed ${seed}, turn ${state.turn}: ${problems.join('; ')}`);
    for (const p of state.players) lowestGold = Math.min(lowestGold, p.gold);
    if (state.turn === 150 && missionsAt150 < 0) missionsAt150 = Object.values(state.settlements).filter((v) => v.mission !== null).length;
    if (state.turn === 100 && Object.keys(coloniesAt100).length === 0) {
      for (const p of state.players) coloniesAt100[p.id] = Object.values(state.colonies).filter((c) => c.owner === p.id).length;
    }
  }
  return { state, coloniesAt100, slowestTurnMs: slowest, lowestGold, events, firstTurn, missionsAt150, privateersAstray, privateerRaids };
}

describe.skipIf(!process.env['SIM'])('the computer powers', () => {
  it.each([11, 12, 13, 14, 15])('seed %i: four powers play 350 turns, each founding three colonies by turn 100', (seed) => {
    const run = runPowers(seed, 350);
    expect(run.state.turn).toBe(350);
    for (const nation of NATION_IDS) expect(run.coloniesAt100[nation], `${nation} on seed ${seed}`).toBeGreaterThanOrEqual(3);
    expect(run.lowestGold).toBeGreaterThanOrEqual(0);
    expect(run.slowestTurnMs).toBeLessThan(200);
    expect(run.events['colonyFounded']).toBeGreaterThanOrEqual(12);
    // R-804: some power's wagon train has sold to a settlement before 1600 (ships of computer powers never trade there)
    expect(run.firstTurn['nativeSale'], `first wagon sale on seed ${seed}`).toBeLessThan(CALENDAR.twoSeasonsFrom - CALENDAR.startYear);
    // R-805: a mission stands in some settlement by turn 150, so that a rival's missionary has something to denounce
    expect(run.missionsAt150, `missions on seed ${seed}`).toBeGreaterThanOrEqual(1);
    // R-806: a privateer is only ever sent to a station or home, so it meets the ships of a power at peace only when they come alongside
    expect(run.privateersAstray, `privateers astray on seed ${seed}`).toBe(0);
  }, 120_000);
});
