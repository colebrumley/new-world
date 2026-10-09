import { describe, expect, it } from 'vitest';
import type { Colonist, GameState, Player } from '../../../../src/engine/state';
import { foreignAffairsReport, powerSummary } from '../../../../src/ui/reports/foreign';
import { withColony, withUnit, world } from '../../../helpers/world';

const ROWS = ['~~~~~~~~', '~......~', '~......~', '~~~~~~~~'];
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
function base(fathers: string[] = [], change: Partial<Player> = {}): GameState {
  let s = world({ rows: ROWS, players: [{ id: 'a', fathers }, { id: 'b', kind: 'ai' }, { id: 'c', kind: 'ai' }] });
  const stance: Record<string, Record<string, 'war' | 'peace'>> = { a: { b: 'peace' }, b: { a: 'peace', c: 'war' }, c: { b: 'war' } };
  s = { ...s, players: s.players.map((p) => ({ ...p, stance: stance[p.id] ?? {}, ...(p.id === 'a' ? change : {}) })) };
  s = withColony(s, { id: 'c1', owner: 'b', x: 1, y: 1, name: 'One', colonists: people(3, 'x') });
  s = withColony(s, { id: 'c2', owner: 'b', x: 5, y: 2, name: 'Two', colonists: people(4, 'y') });
  s = withUnit(s, { id: 's', owner: 'b', type: 'soldier', x: 1, y: 1 });
  s = withUnit(s, { id: 'd', owner: 'b', type: 'dragoon', x: 1, y: 1 });
  s = withUnit(s, { id: 'w', owner: 'b', type: 'colonist', x: 1, y: 1 });
  s = withUnit(s, { id: 'f', owner: 'b', type: 'frigate', profession: null, x: 0, y: 1 });
  return withUnit(s, { id: 'm', owner: 'b', type: 'merchantman', profession: null, x: 0, y: 2 });
}

describe('how a power is summed up', () => {
  it('counts colonies and people, the arms it bears and the ships it sails', () => {
    expect(powerSummary(base(), 'b')).toEqual({ colonies: 2, population: 7, averageSize: 3.5, military: 5, naval: 16, merchant: 8 });
    expect(powerSummary(base(), 'c')).toEqual({ colonies: 0, population: 0, averageSize: 0, military: 0, naval: 0, merchant: 0 });
  });
});

describe('Foreign Affairs report', () => {
  it('before de Witt shows only who is at war with whom', () => {
    const r = foreignAffairsReport(base(), 'a')!;
    expect(r.title).toBe('Foreign Affairs');
    expect(r.sections[0]?.rows).toEqual([
      ['', 'Eng.', 'Fr.', 'Span.'],
      ['England', '-', 'Peace', 'No contact'],
      ['France', 'Peace', '-', 'War'],
      ['Spain', 'No contact', 'War', '-'],
    ]);
    expect(r.sections[1]?.rows).toEqual([]);
    expect(r.sections[1]?.empty).toContain('Jan de Witt');
  });

  it('with de Witt compares the powers', () => {
    const rows = foreignAffairsReport(base(['janDeWitt']), 'a')!.sections[1]!.rows;
    expect(rows[0]).toEqual(['', 'Colonies', 'Population', 'Average colony', 'Military', 'Naval', 'Merchant marine']);
    expect(rows[2]).toEqual(['France', '2', '7', '3.5', '5', '16', '8']);
    expect(rows).toHaveLength(4);
  });

  it('leaves out a power that has withdrawn and marks one that is independent', () => {
    const s = base();
    const changed = { ...s, players: s.players.map((p) => (p.id === 'b' ? { ...p, independent: true } : p.id === 'c' ? { ...p, withdrawn: true } : p)) };
    expect(foreignAffairsReport(changed, 'a')!.sections[0]?.rows.map((row) => row[0])).toEqual(['', 'England', 'France (independent)']);
  });

  it('is not to be had once independence is declared', () => {
    expect(foreignAffairsReport(base(['janDeWitt'], { atWar: true }), 'a')).toBeNull();
  });
});
