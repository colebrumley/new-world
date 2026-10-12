import { describe, expect, it, vi } from 'vitest';
import { HALL_KEY, entryFor, hallReport, hallSection, readHall, recordGame, withEntry, type HallEntry } from '../../../src/app/hall-of-fame';
import type { GameState } from '../../../src/engine/state';
import { scoreReport } from '../../../src/ui/reports/score';
import { withColony, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~~~~~~'];
const game = (gold = 0, name = 'Player'): GameState => {
  const s = withColony(world({ rows: ROWS, seed: 9, players: [{ id: 'a', fathers: ['adamSmith', 'peterMinuit'] }] }), { id: 'col', x: 2, y: 1, name: 'C', sol: { n: 60, d: 200 } });
  return { ...s, turn: 508, players: s.players.map((p) => ({ ...p, gold, name })), over: { reason: 'retired', turn: 508, player: 'a' } };
};
const cheatedGame = (): GameState => {
  const s = game(150000);
  return { ...s, players: s.players.map((p) => ({ ...p, cheated: true as const })) };
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

  it("records the human's own name; a player named only Player (an older save) is entered as the leader", () => {
    expect(entryFor(game(0, 'Cortes'), 'a')?.leader).toBe('Cortes');
    expect(entryFor(game(0, 'Player'), 'a')?.leader).toBe('Walter Raleigh');
  });

  it('is marked when a cheat was used in the game, and carries no mark otherwise (R-1063)', () => {
    const plain = entryFor(game(150000), 'a')!;
    expect('cheated' in plain).toBe(false);
    expect(entryFor(cheatedGame(), 'a')).toEqual({ ...plain, cheated: true });
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

  it('keeps the mark of a cheated game through the list and the browser store, and shows it after the leader (R-1063)', () => {
    const marked = entry({ game: 'c', cheated: true, rating: 9 });
    expect(withEntry([entry({})], marked)[0]).toEqual(marked);

    // an entry written before there were cheats has no such field, and reads as not cheated
    const old = entry({ game: 'old' });
    const kept = new Map<string, string>([[HALL_KEY, JSON.stringify([marked, old])]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) });
    try {
      expect(readHall()).toEqual([marked, old]);
      expect(readHall()[1]?.cheated).toBeUndefined();
      // a finished cheated game goes into the store marked, and comes back so
      const hall = recordGame(cheatedGame(), 'a');
      expect(hall.find((e) => e.game === '9:508:retired')?.cheated).toBe(true);
      expect(readHall()).toEqual(hall);
    } finally {
      vi.unstubAllGlobals();
    }

    const rows = hallSection([
      entry({ cheated: true }), entry({ game: 'h', declared: true, cheated: true }), entry({ game: 'i', declared: true, won: true, cheated: true }), old,
    ]).rows;
    expect(rows[0]).toEqual(['', 'Leader', 'Level', 'Ended', 'Score', 'Rating', 'Remembered by']);
    expect(rows.slice(1).map((r) => r[1])).toEqual(['L of England, cheated', 'L of England, rebel, cheated', 'L of England, liberator, cheated', 'L of England']);
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

  it('says that cheats were used, just before the total, and changes nothing else (R-1063)', () => {
    const plain = scoreReport(game(150000), 'a', [hallSection([])]);
    const marked = scoreReport(cheatedGame(), 'a', [hallSection([])]);
    const rows = plain.sections[0]!.rows;
    expect(rows.some((r) => r[0] === 'Cheats were used in this game.')).toBe(false);
    expect(marked.sections[0]?.rows).toEqual([...rows.slice(0, -1), ['Cheats were used in this game.', '', ''], rows.at(-1)]);
    expect({ ...marked, sections: marked.sections.slice(1) }).toEqual({ ...plain, sections: plain.sections.slice(1) });
  });

  it('says so when nothing is named after the player', () => {
    const s = world({ rows: ROWS, players: [{ id: 'a' }] });
    expect(scoreReport(s, 'a').sections[1]?.rows).toEqual([['Rating', '0%'], ['Nothing has been named after you. Not yet.']]);
  });
});
