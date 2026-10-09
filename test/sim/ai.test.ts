import { describe, expect, it } from 'vitest';
import { playTurn } from '../../src/ai/european';
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
}

/** Four computer powers play each other with the European policy; invariants are checked after every power's turn. */
export function runPowers(seed: number, turns: number, america = false): AiRun {
  const players = NATION_IDS.map((nation) => ({ id: nation, name: nation, kind: 'ai' as const, nation }));
  let state = createGame({ seed, players, ...(america ? { scenario: 'america' as const } : { world: DEFAULT_WORLD }) });
  const coloniesAt100: Record<string, number> = {};
  const events: Record<string, number> = {};
  const firstTurn: Record<string, number> = {};
  let missionsAt150 = -1;
  let slowest = 0;
  let lowestGold = 0;
  while (state.turn < turns && !state.over) {
    const began = performance.now();
    const turn = playTurn(state);
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
  return { state, coloniesAt100, slowestTurnMs: slowest, lowestGold, events, firstTurn, missionsAt150 };
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
  }, 120_000);
});
