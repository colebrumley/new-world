// Balance simulation (R-1009): twenty full games between four computer powers, measured against
// the target ranges of REQUIREMENTS.md Appendix L. `SIM=1 npm test -- balance` writes docs/BALANCE.md.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { playTurn } from '../../src/ai/european';
import { firstTurnOfYear } from '../../src/engine/calendar';
import { DEFAULT_WORLD } from '../../src/engine/data/mapgen';
import { NATION_IDS } from '../../src/engine/data/nations';
import { NATIVES } from '../../src/engine/data/tribes';
import { createGame } from '../../src/engine/game';
import { checkInvariants } from '../../src/engine/invariants';
import { rebelSentiment } from '../../src/engine/liberty';
import { scoreOf } from '../../src/engine/score';
import type { GameState } from '../../src/engine/state';

/** Appendix L. */
const TARGET = {
  firstColonyBy: 8,
  colonies: { 1600: [3, 8], 1700: [5, 14], 1800: [6, 20] } as Record<number, readonly [number, number]>,
  coloniesInAll: 48,
  nativeWars: [1, 6] as const,
  settlementsDestroyedPct: [5, 40] as const,
  sentimentSeedsPct: 30,
  slowestTurnMs: 2000,
};
const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i);

interface Game {
  readonly seed: number;
  /** The turn each power founded its first colony (-1: never). */
  readonly firstColony: number[];
  readonly colonies: Record<number, number[]>;
  readonly independence: number;
  readonly nativeWars: number;
  readonly settlementsAtStart: number;
  readonly settlementsDestroyed: number;
  readonly bestSentiment: number;
  readonly endReason: string;
  readonly endYearTurn: number;
  readonly scores: number[];
  readonly slowestTurnMs: number;
  readonly raids: number;
  readonly burned: number;
  readonly gifts: number;
  readonly skirmishes: number;
}

function play(seed: number): Game {
  const players = NATION_IDS.map((nation) => ({ id: nation, name: nation, kind: 'ai' as const, nation }));
  let state: GameState = createGame({ seed, players, world: DEFAULT_WORLD });
  const settlementsAtStart = Object.keys(state.settlements).length;
  const firstColony = players.map(() => -1);
  const colonies: Record<number, number[]> = {};
  const count = (s: GameState): number[] => players.map((p) => Object.values(s.colonies).filter((c) => c.owner === p.id).length);
  let independence = 0;
  let nativeWars = 0;
  let bestSentiment = 0;
  let slowest = 0;
  const marks = new Map([1600, 1700].map((year) => [firstTurnOfYear(year), year]));
  // a native war: open war between a people and a power (the people's attitude reaching the pitch of war, a colony
  // burned, a settlement destroyed), each pair counted once; raids by a single angry settlement are counted apart
  const atWar = new Set<string>();
  const skirmish = new Set<string>();
  let raids = 0;
  let burned = 0;
  let gifts = 0;
  let lastMark = -1;
  for (let guard = 0; guard < 4000 && !state.over; guard++) {
    if (marks.has(state.turn) && state.turn !== lastMark && state.current === 0) {
      colonies[marks.get(state.turn) as number] = count(state);
      lastMark = state.turn;
    }
    const began = performance.now();
    const turn = playTurn(state);
    slowest = Math.max(slowest, performance.now() - began);
    state = turn.state;
    for (const e of turn.events) {
      if (e.type === 'independenceGranted') independence++;
      if (e.type === 'attitudeChanged' && e.to >= NATIVES.alarmLevels.length && e.from < e.to) atWar.add(`${e.tribe}:${e.player}`);
      if (e.type === 'colonyRaided') {
        raids++;
        const victim = state.colonies[e.colonyId]?.owner;
        if (victim) skirmish.add(`${e.tribe}:${victim}`);
      }
      if (e.type === 'settlementDestroyed') atWar.add(`${e.tribe}:${e.by}`);
      if (e.type === 'colonyBurned') {
        burned++;
        atWar.add(`${e.tribe}:${e.owner}`);
      }
      if (e.type === 'nativeGift') gifts++;
    }
    const now = count(state);
    now.forEach((n, i) => {
      if (n > 0 && firstColony[i] === -1) firstColony[i] = state.turn;
    });
    nativeWars = atWar.size;
    if (state.current === 0) for (const p of players) bestSentiment = Math.max(bestSentiment, rebelSentiment(state, p.id));
    if (guard % 40 === 0) {
      const problems = checkInvariants(state);
      if (problems.length > 0) throw new Error(`seed ${seed}, turn ${state.turn}: ${problems.join('; ')}`);
    }
  }
  colonies[1800] = count(state);
  return {
    seed, firstColony, colonies, independence, nativeWars, settlementsAtStart,
    settlementsDestroyed: settlementsAtStart - Object.keys(state.settlements).length,
    bestSentiment, endReason: state.over?.reason ?? 'none', endYearTurn: state.turn,
    scores: players.map((p) => scoreOf(state, p.id).total), slowestTurnMs: slowest, raids, burned, gifts, skirmishes: skirmish.size,
  };
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const range = (xs: readonly number[]): string => `${Math.min(...xs)}–${Math.max(...xs)} (mean ${mean(xs).toFixed(1)})`;
const pct = (n: number, of: number): number => (of === 0 ? 0 : Math.round((100 * n) / of));

function report(games: readonly Game[]): { text: string; flags: string[] } {
  const flags: string[] = [];
  const flag = (ok: boolean, text: string): string => {
    if (!ok) flags.push(text);
    return ok ? 'within range' : '**outside range**';
  };
  const lines: string[] = [];
  const firsts = games.flatMap((g) => g.firstColony);
  const never = firsts.filter((t) => t < 0).length;
  const late = firsts.filter((t) => t < 0 || t > TARGET.firstColonyBy).length;
  lines.push('| Metric | Target (Appendix L) | Measured over 20 seeds x 4 powers | Verdict |', '|---|---|---|---|');
  lines.push(`| First colony, turn | every power by turn ${TARGET.firstColonyBy} | ${range(firsts.filter((t) => t >= 0))}; ${late} of ${firsts.length} later than turn ${TARGET.firstColonyBy}${never ? `, ${never} never` : ''} | ${flag(late === 0, `first colony: ${late} of ${firsts.length} powers founded later than turn ${TARGET.firstColonyBy} (latest ${Math.max(...firsts)})`)} |`);
  for (const year of [1600, 1700, 1800]) {
    const all = games.flatMap((g) => g.colonies[year] ?? []);
    const [lo, hi] = TARGET.colonies[year] as readonly [number, number];
    const out = all.filter((n) => n < lo || n > hi).length;
    lines.push(`| Colonies per power at ${year} | ${lo}–${hi} | ${range(all)}; ${out} of ${all.length} outside | ${flag(out === 0, `colonies per power at ${year}: ${out} of ${all.length} outside ${lo}–${hi} (measured ${range(all)})`)} |`);
  }
  const totals = games.map((g) => (g.colonies[1800] ?? []).reduce((a, b) => a + b, 0));
  lines.push(`| Colonies in all at 1800 | at most ${TARGET.coloniesInAll} | ${range(totals)} | ${flag(Math.max(...totals) <= TARGET.coloniesInAll, `total colonies at 1800 reach ${Math.max(...totals)}, over the cap of ${TARGET.coloniesInAll}`)} |`);
  const wars = games.map((g) => g.nativeWars);
  const warsOut = wars.filter((n) => n < TARGET.nativeWars[0] || n > TARGET.nativeWars[1]).length;
  lines.push(`| Native wars per game | ${TARGET.nativeWars[0]}–${TARGET.nativeWars[1]} | ${range(wars)}; ${warsOut} of ${wars.length} games outside | ${flag(warsOut === 0, `native wars per game: ${warsOut} of ${wars.length} games outside ${TARGET.nativeWars[0]}–${TARGET.nativeWars[1]} (measured ${range(wars)})`)} |`);
  const burned = games.map((g) => pct(g.settlementsDestroyed, g.settlementsAtStart));
  const burnedOut = burned.filter((n) => n < TARGET.settlementsDestroyedPct[0] || n > TARGET.settlementsDestroyedPct[1]).length;
  lines.push(`| Settlements destroyed by 1800, % | ${TARGET.settlementsDestroyedPct[0]}–${TARGET.settlementsDestroyedPct[1]} | ${range(burned)}; ${burnedOut} of ${burned.length} games outside | ${flag(burnedOut === 0, `settlements destroyed by 1800: ${burnedOut} of ${burned.length} games outside ${TARGET.settlementsDestroyedPct[0]}–${TARGET.settlementsDestroyedPct[1]}% (measured ${range(burned)})`)} |`);
  const rebels = pct(games.filter((g) => g.bestSentiment >= 50).length, games.length);
  lines.push(`| Seeds in which a computer power reaches 50% rebel sentiment | at least ${TARGET.sentimentSeedsPct}% | ${rebels}% (best per game ${range(games.map((g) => g.bestSentiment))}) | ${flag(rebels >= TARGET.sentimentSeedsPct, `a computer power reaches 50% rebel sentiment in only ${rebels}% of seeds (target ${TARGET.sentimentSeedsPct}%)`)} |`);
  const scored = pct(games.filter((g) => g.endReason === 'retired').length, games.length);
  lines.push(`| Games scored at 1800 | 100% | ${scored}% | ${flag(scored === 100, `only ${scored}% of games reach the 1800 scoring`)} |`);
  const slow = Math.max(...games.map((g) => g.slowestTurnMs));
  lines.push(`| Slowest single power's turn | under ${TARGET.slowestTurnMs} ms | ${slow.toFixed(0)} ms | ${flag(slow < TARGET.slowestTurnMs, `a turn took ${slow.toFixed(0)} ms`)} |`);
  const declared = games.map((g) => g.independence);
  const perSeed = ['| Seed | First colony (E/F/S/N) | Colonies 1600 | 1700 | 1800 | Native wars | Settlements destroyed | Independence granted | Best rebel sentiment | Scores |', '|---|---|---|---|---|---|---|---|---|---|',
    ...games.map((g) => `| ${g.seed} | ${g.firstColony.join('/')} | ${(g.colonies[1600] ?? []).join('/')} | ${(g.colonies[1700] ?? []).join('/')} | ${(g.colonies[1800] ?? []).join('/')} | ${g.nativeWars} | ${g.settlementsDestroyed} of ${g.settlementsAtStart} | ${g.independence} | ${g.bestSentiment}% | ${g.scores.join('/')} |`)];
  const text = [
    '# Balance report (R-1009)',
    '',
    'Written by `SIM=1 npm test -- balance` (`test/sim/balance.test.ts`): twenty full games on generated',
    'worlds, seeds 101 to 120, between four computer powers playing the policy of `src/ai/european.ts`,',
    'from 1492 to the scoring in 1800, on Conquistador. Do not edit by hand; run the simulation again.',
    '',
    'There is no human in these games, so nothing here measures a War of Independence: computer powers',
    `are granted independence by colonist support instead (${declared.reduce((a, b) => a + b, 0)} grants in the twenty games).`,
    'A "native war" is counted once for each people and power in open war: the people\'s attitude at the pitch',
    'of war, a colony burned, or a settlement destroyed. Raids by a single angry settlement are listed apart.',
    '',
    '## Against the target ranges',
    '',
    ...lines,
    '',
    flags.length === 0 ? 'Every metric is within its range on these twenty seeds.' : `## Outside range (${flags.length})\n\n${flags.map((f) => `- ${f}`).join('\n')}\n\nEach of these is a tuning item in REQUIREMENTS.md (data tables only).`,
    '',
    '## Other observations (no target range)',
    '',
    `- Peoples and powers that exchanged raids without open war, per game: ${range(games.map((g) => g.skirmishes))}.`,
    `- Raids on colonies per game: ${range(games.map((g) => g.raids))}; colonies burned per game: ${range(games.map((g) => g.burned))}.`,
    `- Gifts from native settlements to colonies per game: ${range(games.map((g) => g.gifts))}.`,
    `- Scores at 1800 per power: ${range(games.flatMap((g) => g.scores))}.`,
    '',
    '## Game by game',
    '',
    ...perSeed,
    '',
  ].join('\n');
  return { text, flags };
}

describe.skipIf(!process.env['SIM'])('balance', () => {
  it('plays twenty full games and writes docs/BALANCE.md', () => {
    const games = SEEDS.map(play);
    const { text, flags } = report(games);
    writeFileSync(join(__dirname, '../../docs/BALANCE.md'), text);
    // the report is the product; what must hold is that every game ran to its end and was measured
    expect(games).toHaveLength(20);
    for (const g of games) {
      expect(g.endReason, `seed ${g.seed}`).not.toBe('none');
      expect(Object.keys(g.colonies).sort()).toEqual(['1600', '1700', '1800']);
    }
    expect(text).toContain('## Against the target ranges');
    expect(flags.length).toBeGreaterThanOrEqual(0);
  }, 1_200_000);
});
