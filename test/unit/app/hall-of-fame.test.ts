import { describe, expect, it } from 'vitest';
import { entryFor, hallReport, hallSection, withEntry, type HallEntry } from '../../../src/app/hall-of-fame';
import type { GameState } from '../../../src/engine/state';
import { scoreReport } from '../../../src/ui/reports/score';
import { withColony, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~~~~~~'];
const game = (gold = 0): GameState => {
  const s = withColony(world({ rows: ROWS, seed: 9, players: [{ id: 'a', fathers: ['adamSmith', 'peterMinuit'] }] }), { id: 'col', x: 2, y: 1, name: 'C', sol: { n: 60, d: 200 } });
  return { ...s, turn: 508, players: s.players.map((p) => ({ ...p, gold })), over: { reason: 'retired', turn: 508, player: 'a' } };
};
const entry = (change: Partial<HallEntry>): HallEntry => ({ game: 'g', leader: 'L', nation: 'england', declared: false, won: false, date: 'Spring 1800', difficulty: 'conquistador', score: 100, rating: 3, rank: 2, ...change });

describe('a Hall of Fame entry', () => {
  it('records who, when, how hard and how well', () => {
    // 2 for the colonist + 10 for two fathers + 30 sentiment + 150 for the gold
    expect(entryFor(game(150000), 'a')).toEqual({
      game: '9:508:retired', leader: 'Walter Raleigh', nation: 'england', declared: false, won: false, date: 'Spring 1800', difficulty: 'conquistador', score: 192, rating: 5, rank: 4,
    });
    expect(entryFor(game(), 'nobody')).toBeNull();
  });
});

describe('the Hall', () => {
  it('is kept best rating first, then best score, ten deep, and never holds a game twice', () => {
    let hall: HallEntry[] = [];
    for (let i = 0; i < 12; i++) hall = withEntry(hall, entry({ game: `g${i}`, rating: i % 4, score: 100 + i }));
    expect(hall).toHaveLength(10);
    expect(hall.map((e) => e.rating)).toEqual([3, 3, 3, 2, 2, 2, 1, 1, 1, 0]);
    expect(hall.slice(0, 3).map((e) => e.score)).toEqual([111, 107, 103]);
    expect(withEntry(hall, entry({ game: 'g11', rating: 99 }))).toEqual(hall);
  });

  it('is set out as a table, or says it is empty', () => {
    expect(hallSection([])).toMatchObject({ rows: [], empty: 'No game has been finished yet.' });
    const rows = hallReport([entry({ won: true, declared: true, rank: 23 }), entry({ game: 'h', declared: true, rank: null })]).sections[0]!.rows;
    expect(rows[0]).toEqual(['', 'Leader', 'Level', 'Ended', 'Score', 'Rating', 'Remembered by']);
    expect(rows[1]).toEqual(['1', 'L of England, liberator', 'Conquistador', 'Spring 1800', '100', '3%', 'a continent']);
    expect(rows[2]).toEqual(['2', 'L of England, rebel', 'Conquistador', 'Spring 1800', '100', '3%', '-']);
  });
});

describe('the score report', () => {
  it('lists the terms and the total, the rating, and the honour', () => {
    const r = scoreReport(game(150000), 'a', [hallSection([])]);
    expect(r.title).toBe('Colonial Score');
    expect(r.sections[0]?.rows).toEqual([
      ['Specialists', '0', '0'],
      ['Free colonists', '1', '2'],
      ['Servants, criminals and converts', '0', '0'],
      ['Founding Fathers', '2', '10'],
      ['Treasury', '150000 gold', '150'],
      ['Rebel sentiment', '30%', '30'],
      ['Total', '', '192'],
    ]);
    expect(r.sections[1]?.rows).toEqual([['Rating', '5%'], ['Posterity has named a mill pond after you.']]);
    expect(r.sections[2]?.heading).toBe('Hall of Fame');
    expect(scoreReport(game(), 'a').sections[1]?.rows[1]).toEqual(['Posterity has named a village pump after you.']);
  });

  it('says so when nothing is named after the player', () => {
    const s = world({ rows: ROWS, players: [{ id: 'a' }] });
    expect(scoreReport(s, 'a').sections[1]?.rows).toEqual([['Rating', '0%'], ['Nothing has been named after you. Not yet.']]);
  });
});
