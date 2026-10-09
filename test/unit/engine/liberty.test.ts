import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/engine/actions';
import { LIBERTY } from '../../../src/engine/data/liberty';
import { colonyProduction, colonyTurn, indoorOutput, type EconomyEvent } from '../../../src/engine/economy';
import { fieldOutput, centerOutput } from '../../../src/engine/jobs';
import { colonyBells, membershipBand, rebelSentiment, solPercent, solProductionTerm, toryPenalty, updateLiberty, type LibertyEvent } from '../../../src/engine/liberty';
import type { Colonist, Colony, GameState } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~....~', '~~~~~~'];
const people = (n: number, job: Colonist['job'] = { kind: 'idle' }, profession: Colonist['profession'] = 'freeColonist'): Colonist[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}${job.kind}`, profession, job , turns: 0 }));
interface Spec { pop?: number; colonists?: Colonist[]; sol?: Colony['sol']; solLevel?: number; buildings?: string[]; fathers?: string[]; ai?: boolean; difficulty?: GameState['difficulty']; taxRate?: number; toryNoticed?: boolean }
function town(spec: Spec = {}): GameState {
  const s = world({ rows: ROWS, difficulty: spec.difficulty ?? 'conquistador', players: [{ id: 'a', fathers: spec.fathers ?? [], kind: spec.ai ? 'ai' : 'human', taxRate: spec.taxRate ?? 0 }, { id: 'b' }] });
  const colonists = spec.colonists ?? people(spec.pop ?? 4);
  return withColony(s, {
    id: 'col', x: 2, y: 2, colonists, buildings: spec.buildings ?? ['townHall'], goods: { food: 100 },
    sol: spec.sol ?? { n: 0, d: 100 * colonists.length }, solLevel: spec.solLevel ?? 0, toryNoticed: spec.toryNoticed ?? false,
  });
}
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const pct = (spec: Spec): number => solPercent(town(spec), col(town(spec)));
const statesmen = (n: number, profession: Colonist['profession'] = 'freeColonist'): Colonist[] => people(n, { kind: 'work', trade: 'statesman' }, profession);

describe('membership percentage', () => {
  it('is the floor of 100 n / d, capped, and nil for an empty bookkeeping', () => {
    expect(LIBERTY).toMatchSnapshot();
    expect(pct({ sol: { n: 0, d: 400 } })).toBe(0);
    expect(pct({ sol: { n: 199, d: 400 } })).toBe(49);
    expect(pct({ sol: { n: 200, d: 400 } })).toBe(50);
    expect(pct({ sol: { n: 400, d: 400 } })).toBe(100);
    expect(pct({ sol: { n: 10, d: 0 } })).toBe(0);
  });

  it('Bolivar adds 20 points for a human power, capped at 100', () => {
    expect(pct({ sol: { n: 100, d: 400 }, fathers: ['simonBolivar'] })).toBe(45);
    expect(pct({ sol: { n: 360, d: 400 }, fathers: ['simonBolivar'] })).toBe(100);
    expect(pct({ sol: { n: 100, d: 400 }, fathers: ['simonBolivar'], ai: true })).toBe(25);
  });

  it('the bookkeeping follows colonists in and out', () => {
    const founded = applyAction(withUnit(world({ rows: ROWS }), { id: 'u1', x: 2, y: 2 }), { type: 'foundColony', unitId: 'u1' }).state;
    const colony = Object.values(founded.colonies)[0] as Colony;
    expect(colony.sol).toEqual({ n: 0, d: 200 });
    let s = applyAction(withUnit(founded, { id: 'u2', x: 2, y: 2 }), { type: 'joinColony', unitId: 'u2' }).state;
    expect(Object.values(s.colonies)[0]?.sol).toEqual({ n: 0, d: 300 });
    s = applyAction(s, { type: 'leaveColony', colonyId: colony.id, colonistId: 'u2' }).state;
    expect(Object.values(s.colonies)[0]?.sol).toEqual({ n: 0, d: 200 });
  });
});

describe('bells', () => {
  const bells = (spec: Spec): number => colonyProduction(town(spec), col(town(spec))).produced.bells;

  it('every colony rings 1; statesmen add 3 each, an Elder Statesman 6', () => {
    expect(bells({ pop: 1 })).toBe(1);
    expect(bells({ colonists: statesmen(1) })).toBe(4);
    expect(bells({ colonists: statesmen(3) })).toBe(10);
    expect(bells({ colonists: statesmen(1, 'elderStatesman') })).toBe(7);
    expect(bells({ colonists: statesmen(1, 'indenturedServant') })).toBe(3);
    expect(bells({ colonists: statesmen(1, 'pettyCriminal') })).toBe(2);
  });

  it('a Printing Press adds half and a Newspaper doubles instead (they do not stack), rounding down on the total', () => {
    expect(bells({ pop: 1, buildings: ['townHall', 'printingPress'] })).toBe(1); // 1 + floor(1/2)
    expect(bells({ pop: 1, buildings: ['townHall', 'printingPress', 'newspaper'] })).toBe(2);
    expect(bells({ colonists: statesmen(1), buildings: ['townHall', 'printingPress'] })).toBe(6);
    expect(bells({ colonists: statesmen(1), buildings: ['townHall', 'printingPress', 'newspaper'] })).toBe(8);
    expect(bells({ colonists: statesmen(1, 'elderStatesman'), buildings: ['townHall', 'printingPress'] })).toBe(10);
  });

  it('Jefferson adds half of the whole total; Paine adds the tax rate in percent; both before the press', () => {
    expect(bells({ colonists: statesmen(1), fathers: ['thomasJefferson'] })).toBe(6);
    expect(bells({ pop: 1, fathers: ['thomasJefferson'] })).toBe(1);
    expect(bells({ colonists: statesmen(3), fathers: ['thomasPaine'], taxRate: 30 })).toBe(13);
    expect(bells({ colonists: statesmen(3), fathers: ['thomasPaine'], taxRate: 0 })).toBe(10);
    // 10 -> Jefferson 15 -> Paine at 20% 18 -> Newspaper 36
    expect(bells({ colonists: statesmen(3), fathers: ['thomasJefferson', 'thomasPaine'], taxRate: 20, buildings: ['townHall', 'printingPress', 'newspaper'] })).toBe(36);
    expect(colonyBells(town({ ai: true, fathers: ['simonBolivar'], pop: 7 }), col(town({ ai: true, fathers: ['simonBolivar'], pop: 7 })), 0)).toBe(3); // 1 + (7+3)/5
  });

  it('are added to the power\'s running total', () => {
    const events: EconomyEvent[] = [];
    const after = colonyTurn(town({ colonists: statesmen(2) }), 'col', events);
    expect(after.players[0]?.bells).toBe(7);
    expect(after.players[1]?.bells).toBe(0);
  });
});

describe('membership over time', () => {
  const step = (spec: Spec, bells: number): { colony: Colony; events: LibertyEvent[] } => {
    const s = town(spec);
    const events: LibertyEvent[] = [];
    return { colony: updateLiberty(s, col(s), bells, events), events };
  };

  it('each turn sheds 1/64 of both figures, adds 2 per colonist below and the bells above', () => {
    const r = step({ pop: 4, sol: { n: 128, d: 640 } }, 10);
    expect(r.colony.sol).toEqual({ n: 128 + 10 - 2, d: 640 - 10 + 8 });
  });

  it('a colony ringing fewer bells than it has people loses a little more', () => {
    // membership 40%: 40 / 20 = 2 bells are taken off the 3 rung
    const r = step({ pop: 4, sol: { n: 256, d: 640 } }, 3);
    expect(r.colony.sol.n).toBe(256 + (3 - 2) - 4);
    const enough = step({ pop: 4, sol: { n: 256, d: 640 } }, 4);
    expect(enough.colony.sol.n).toBe(256 + 4 - 4);
  });

  it('never goes below nil or above the whole', () => {
    expect(step({ pop: 4, sol: { n: 1, d: 400 } }, 0).colony.sol.n).toBe(1);
    expect(step({ pop: 20, sol: { n: 0, d: 2000 }, solLevel: 0 }, 0).colony.sol.n).toBe(0);
    const full = step({ pop: 1, sol: { n: 128, d: 128 }, solLevel: 2 }, 500);
    expect(full.colony.sol.n).toBe(full.colony.sol.d);
  });

  it('settles at bells / (2 x population): two bells a head hold 100%', () => {
    const settle = (pop: number, bells: number): number => {
      let s = town({ pop });
      for (let i = 0; i < 600; i++) s = { ...s, colonies: { col: updateLiberty(s, col(s), bells, []) } };
      return solPercent(s, col(s));
    };
    expect(settle(4, 8)).toBeGreaterThanOrEqual(98);
    expect(settle(4, 4)).toBeGreaterThanOrEqual(48);
    expect(settle(4, 4)).toBeLessThanOrEqual(50);
    // fewer bells than people: the small-colony loss pulls the level a little under bells / (2 x pop) = 25%
    expect(settle(10, 5)).toBeGreaterThanOrEqual(19);
    expect(settle(10, 5)).toBeLessThanOrEqual(21);
  });
});

describe('the production bonus', () => {
  const step = (spec: Spec, bells = 0) => {
    const s = town(spec);
    const events: LibertyEvent[] = [];
    const colony = updateLiberty(s, col(s), bells, events);
    return { level: colony.solLevel, types: events.map((e) => e.type) };
  };
  const at = (percent: number, pop = 4): Colony['sol'] => ({ n: percent * pop * 10, d: pop * 1000 });

  it('is earned at 50% and at 100%, one step per turn, with a notice each time', () => {
    expect(step({ sol: at(49) }, 8)).toEqual({ level: 0, types: [] });
    expect(step({ sol: at(55) }, 8)).toMatchObject({ level: 1, types: ['rebelMajority'] });
    expect(step({ sol: at(100), solLevel: 0 }, 60)).toMatchObject({ level: 1, types: ['rebelMajority'] }); // straight to 100 still takes two turns
    expect(step({ sol: at(100), solLevel: 1 }, 60)).toMatchObject({ level: 2, types: ['rebelUnanimous'] });
    expect(step({ sol: at(100), solLevel: 2 }, 60)).toMatchObject({ level: 2, types: [] });
  });

  it('the second step is kept down to 95% and the first down to 50%, lost one step per turn', () => {
    expect(step({ sol: at(97), solLevel: 2 }, 8).level).toBe(2);
    expect(step({ sol: at(93), solLevel: 2 }, 8)).toMatchObject({ level: 1, types: ['toryMinority'] });
    expect(step({ sol: at(30), solLevel: 2 }, 0)).toMatchObject({ level: 1, types: ['toryMinority'] });
    expect(step({ sol: at(30), solLevel: 1 }, 0)).toMatchObject({ level: 0, types: ['toryMajority'] });
    expect(step({ sol: at(52), solLevel: 1 }, 8).level).toBe(1);
  });

  it('otherwise reports membership passing a ten', () => {
    expect(step({ sol: at(29) }, 100)).toMatchObject({ level: 0, types: ['membershipChanged'] });
    expect(step({ sol: at(25) }, 9).types).toEqual([]);
  });

  it('adds to every worker indoors and out and to the colony square; an expert doubles it', () => {
    const s = town({ solLevel: 1, sol: { n: 300, d: 400 }, pop: 4 });
    expect(solProductionTerm(s, col(s))).toBe(1);
    expect(fieldOutput(s, col(s), 'freeColonist', 1, 0, 'food')).toBe(6);
    expect(fieldOutput(s, col(s), 'freeColonist', 1, 0, 'cotton')).toBe(3);
    expect(centerOutput(s, col(s))).toEqual({ food: 4, secondary: { good: 'cotton', amount: 3 } });
    expect(indoorOutput('weaver', 'masterWeaver', { level: 1, sol: solProductionTerm(s, col(s)), hasPenn: false })).toBe(8);
    const two = town({ solLevel: 2, sol: { n: 400, d: 400 } });
    expect(fieldOutput(two, col(two), 'freeColonist', 1, 0, 'food')).toBe(7);
    const r = colonyProduction(town({ solLevel: 2, sol: { n: 400, d: 400 }, colonists: statesmen(1) }), col(town({ solLevel: 2, sol: { n: 400, d: 400 }, colonists: statesmen(1) })));
    expect(r.produced.bells).toBe(6); // (3 + 2) + 1
  });
});

describe('Tories', () => {
  const penalty = (spec: Spec): number => toryPenalty(town(spec), col(town(spec)));

  it('cost one unit of production per threshold of Tories: 10, 9, 8, 7, 6 by difficulty', () => {
    expect(penalty({ pop: 7, difficulty: 'conquistador' })).toBe(0);
    expect(penalty({ pop: 8, difficulty: 'conquistador' })).toBe(1);
    expect(penalty({ pop: 16, difficulty: 'conquistador' })).toBe(2);
    expect(penalty({ pop: 9, difficulty: 'discoverer' })).toBe(0);
    expect(penalty({ pop: 10, difficulty: 'discoverer' })).toBe(1);
    expect(penalty({ pop: 6, difficulty: 'viceroy' })).toBe(1);
    expect(penalty({ pop: 5, difficulty: 'viceroy' })).toBe(0);
    // half of 16 are members: 8 Tories
    expect(penalty({ pop: 16, sol: { n: 800, d: 1600 }, difficulty: 'conquistador' })).toBe(1);
    expect(penalty({ pop: 16, sol: { n: 1600, d: 1600 } })).toBe(0);
  });

  it('do not trouble AI colonies', () => {
    expect(penalty({ pop: 30, ai: true })).toBe(0);
  });

  it('take from every worker, never below nothing, but not from the colony square', () => {
    const s = town({ pop: 16 });
    expect(solProductionTerm(s, col(s))).toBe(-2);
    expect(fieldOutput(s, col(s), 'freeColonist', 1, 0, 'food')).toBe(3);
    expect(fieldOutput(s, col(s), 'freeColonist', 1, 0, 'cotton')).toBe(0);
    expect(centerOutput(s, col(s)).food).toBe(3);
    expect(indoorOutput('weaver', 'freeColonist', { level: 1, sol: -2, hasPenn: false })).toBe(1);
  });

  it('are announced once when they reach the threshold and again when they subside', () => {
    const run = (spec: Spec): string[] => {
      const s = town(spec);
      const events: LibertyEvent[] = [];
      updateLiberty(s, col(s), 0, events);
      return events.map((e) => e.type).filter((t) => t.startsWith('tories'));
    };
    expect(run({ pop: 8 })).toEqual(['toriesObstruct']);
    expect(run({ pop: 8, toryNoticed: true })).toEqual([]);
    expect(run({ pop: 7 })).toEqual([]);
    expect(run({ pop: 8, toryNoticed: true, sol: { n: 790, d: 800 }, solLevel: 2 })).toEqual(['toriesSubside']);
  });
});

describe('across the nation', () => {
  it('rebel sentiment is membership weighted by population; the map colours colonies by band', () => {
    let s = town({ pop: 2, sol: { n: 200, d: 200 } });
    s = withColony(s, { id: 'two', x: 4, y: 2, colonists: people(6), sol: { n: 0, d: 600 } });
    s = withColony(s, { id: 'theirs', x: 4, y: 3 - 2, owner: 'b', colonists: people(9), sol: { n: 900, d: 900 } });
    expect(rebelSentiment(s, 'a')).toBe(25); // (100 x 2 + 0 x 6) / 8
    expect(rebelSentiment(s, 'b')).toBe(100);
    expect(rebelSentiment(world({ rows: ROWS }), 'a')).toBe(0);
    expect(membershipBand(s, s.colonies['col'] as Colony)).toBe('unanimous');
    expect(membershipBand(s, s.colonies['two'] as Colony)).toBe('minority');
    const half = town({ sol: { n: 200, d: 400 } });
    expect(membershipBand(half, col(half))).toBe('majority');
  });
});
