import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../../../../src/engine/state';
import { congressReport } from '../../../../src/ui/reports/congress';
import { withColony, world } from '../../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~~~~~~'];
const base = (change: Partial<Player> = {}, fathers: string[] = []): GameState => {
  const s = world({ rows: ROWS, difficulty: 'conquistador', players: [{ id: 'a', fathers }, { id: 'b' }] });
  return { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...change } : p)) };
};
const section = (s: GameState, heading: RegExp): readonly (readonly string[])[] => congressReport(s, 'a').sections.find((x) => heading.test(x.heading))!.rows;

describe('Congress report', () => {
  it('lists the members by field with what each does', () => {
    const r = congressReport(base({}, ['thomasJefferson', 'adamSmith', 'peterMinuit']), 'a');
    expect(r.title).toBe('Continental Congress');
    expect(r.sections[0]?.heading).toBe('Members (3 of 25)');
    expect(r.sections[0]?.rows.map((row) => [row[0], row[1]])).toEqual([['Adam Smith', 'Trade'], ['Peter Minuit', 'Trade'], ['Thomas Jefferson', 'Political']]);
    expect(congressReport(base(), 'a').sections[0]).toMatchObject({ rows: [], empty: 'No Founding Father has joined the Congress yet.' });
  });

  it('shows the candidate and the bells still needed', () => {
    const rows = section(base({ candidate: 'paulRevere', fatherBells: 12 }), /Next session/);
    expect(rows[0]?.slice(0, 2)).toEqual(['Next to be seated', 'Paul Revere']);
    expect(rows[1]).toEqual(['Liberty bells', '12 of 40', '28 more needed']);
    expect(section(base({ fatherOffer: ['paulRevere'] }), /Next session/)[0]?.[0]).toContain('awaits our choice');
    expect(section(base(), /Next session/)[1]).toEqual(['Liberty bells', '0 of 40']);
    expect(section(base({ atWar: true }), /Next session/)[0]?.[0]).toContain('Independence is declared');
  });

  it('gives rebel sentiment and the size of the Expeditionary Force', () => {
    const s = withColony(base(), { id: 'col', x: 2, y: 1, name: 'Home', sol: { n: 3, d: 4 } });
    expect(section(s, /Rebel sentiment/).map((row) => row.slice(0, 2))).toEqual([['Sons of Liberty', '75%'], ['Tories', '25%']]);
    expect(section(s, /Rebel sentiment/)[0]?.[2]).toContain('Enough');
    expect(section(s, /Royal Expeditionary Force/)).toEqual([['Regulars', '31'], ['Cavalry', '15'], ['Artillery', '14'], ['Men-of-War', '8']]);
  });

  it('is empty for nobody', () => {
    expect(congressReport(base(), 'nobody').sections).toEqual([]);
  });
});
