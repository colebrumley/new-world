import { describe, expect, it } from 'vitest';
import { playTurn } from '../../src/ai/european';
import { invadeRequests, isTroop, scaledOdds } from '../../src/ai/campaign';
import { navalStations, privateersCarry } from '../../src/ai/navy';
import { AI_CAMPAIGN } from '../../src/engine/data/ai';
import type { Action, GameEvent } from '../../src/engine/actions';
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
  /** R-807: troops put ashore from a ship lying off an invasion beach; and attacks on land made at scaled odds under twelve. */
  readonly landings: number;
  readonly rashAttacks: number;
  /** Ships and guns bought in Europe, by kind. */
  readonly purchases: Readonly<Record<string, number>>;
}

/** Four computer powers play each other with the European policy; invariants are checked after every power's turn. */
export function runPowers(seed: number, turns: number, america = false): AiRun {
  const players = NATION_IDS.map((nation) => ({ id: nation, name: nation, kind: 'ai' as const, nation }));
  let state = createGame({ seed, players, ...(america ? { scenario: 'america' as const } : { world: DEFAULT_WORLD }) });
  const coloniesAt100: Record<string, number> = {};
  const events: Record<string, number> = {};
  const firstTurn: Record<string, number> = {};
  const purchases: Record<string, number> = {};
  let missionsAt150 = -1;
  let privateersAstray = 0;
  let privateerRaids = 0;
  let landings = 0;
  let rashAttacks = 0;
  const watch = (before: GameState, action: Action, happened: readonly GameEvent[]): void => {
    const unit = 'unitId' in action ? before.units[action.unitId] : undefined;
    const player = before.players[before.current];
    if (!unit || !player) return;
    if (isTroop(unit)) {
      const ship = unit.aboard === null ? undefined : before.units[unit.aboard];
      if (action.type === 'moveUnit' && ship && invadeRequests(before, player).some((r) => r.x === ship.x && r.y === ship.y)) landings++;
      if (action.type === 'attack' && scaledOdds(before, unit, action.dx, action.dy) < AI_CAMPAIGN.oddsLeast) rashAttacks++;
    }
    if (unit.type !== 'privateer') return;
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
      if (e.type === 'unitPurchased') purchases[e.unitType] = (purchases[e.unitType] ?? 0) + 1;
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
  return { state, coloniesAt100, slowestTurnMs: slowest, lowestGold, events, firstTurn, missionsAt150, privateersAstray, privateerRaids, landings, rashAttacks, purchases };
}

describe.skipIf(!process.env['SIM'])('the computer powers', () => {
  /** The turn of the first wagon sale on each seed played. */
  const wagonSales: number[] = [];
  /** Settlements holding a mission at turn 150 on each seed played. */
  const missions: number[] = [];

  it.each([11, 12, 13, 14, 15])('seed %i: four powers play 350 turns, most with a colony by turn 100', (seed) => {
    const run = runPowers(seed, 350);
    expect(run.state.turn).toBe(350);
    // a power grows its first colony before it founds more (how large depends on its leader), and may have lost it to a rival by then:
    // most of the four hold one, and there are more colonies than powers
    expect(NATION_IDS.filter((nation) => (run.coloniesAt100[nation] ?? 0) >= 1).length, `powers with a colony on seed ${seed}`).toBeGreaterThanOrEqual(3);
    expect(NATION_IDS.reduce((n, nation) => n + (run.coloniesAt100[nation] ?? 0), 0), `colonies on seed ${seed}`).toBeGreaterThanOrEqual(4);
    // colonists go where a colony wants them, so few starve
    expect(run.events['colonistStarved'] ?? 0, `starved on seed ${seed}`).toBeLessThan(25);
    expect(run.lowestGold).toBeGreaterThanOrEqual(0);
    expect(run.slowestTurnMs).toBeLessThan(200);
    expect(run.events['colonyFounded']).toBeGreaterThanOrEqual(12);
    // R-804: wagon sales are checked over the five seeds together, below (ships of computer powers never trade there)
    wagonSales.push(run.firstTurn['nativeSale'] ?? Infinity);
    // R-805: missions are checked over the five seeds together, below
    missions.push(run.missionsAt150);
    // R-806: a privateer is only ever sent to a station or home, so it meets the ships of a power at peace only when they come alongside
    expect(run.privateersAstray, `privateers astray on seed ${seed}`).toBe(0);
    // R-807: some power lands troops beside a rival colony, and nobody attacks on land at scaled odds under twelve
    expect(run.landings, `landings on seed ${seed}`).toBeGreaterThanOrEqual(1);
    expect(run.rashAttacks, `rash attacks on seed ${seed}`).toBe(0);
    // the round of buying in Europe: every game sees ships bought
    expect(Object.keys(run.purchases).some((t) => t !== 'artillery'), `ships bought on seed ${seed}`).toBe(true);
  }, 120_000);

  it('on some seed a power sells to a settlement by wagon', () => {
    // a colony thinks of a wagon train only once it has four people, and its ships and Custom House carry off most of what a wagon
    // would sell, so wagon sales by computer powers are uncommon
    expect(wagonSales).toHaveLength(5);
    expect(wagonSales.filter((turn) => Number.isFinite(turn)).length).toBeGreaterThanOrEqual(1);
  });

  it('on most seeds a mission stands in some settlement by turn 150', () => {
    // a missionary is made only of a colonist waiting on the docks on the right turn, and the docks are often empty or its people armed
    expect(missions).toHaveLength(5);
    expect(missions.filter((n) => n >= 1).length).toBeGreaterThanOrEqual(3);
  });
});
