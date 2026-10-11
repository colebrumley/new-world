// R-1031: the generated tables of the pages Europe and Trade and The Crown and Independence read
// the rule tables the way the game does.
import { describe, expect, it } from 'vitest';
import { difficultyProfile } from '../../../src/engine/difficulty';
import { GOOD_IDS } from '../../../src/engine/data/goods';
import { SKILLED_IMMIGRANTS } from '../../../src/engine/data/immigration';
import { PROFESSIONS } from '../../../src/engine/data/professions';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { trainingPrice } from '../../../src/engine/europe';
import { TABLES } from '../../helpers/wiki/tables';

const rows = (name: string): string[] => TABLES[name]!().split('\n').slice(2);

describe('the Europe and Crown tables', () => {
  it('market: one row per good, bid = price - 1 and the ask gap from the burden', () => {
    const market = rows('market');
    expect(market).toHaveLength(GOOD_IDS.length);
    // food opens at price 1..3, so bid 0..2; it never bids above 5; the ask is 1 + 7 above the bid
    expect(market[0]).toBe('| ![Food](images/art/goods/food.png) | Food | 0 to 2 | 0 | 5 | 8 |');
    expect(market.find((r) => r.includes('| Silver |'))).toContain('| Silver | 19 | 1 | 19 | 1 |');
    expect(market.find((r) => r.includes('| Cloth |'))).toContain('| set by demand |');
  });

  it('training: every course the University sells, cheapest first', () => {
    const training = rows('training');
    const prices = training.map((r) => Number(r.split(' | ')[1]));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(training).toHaveLength(Object.keys(PROFESSIONS).filter((p) => trainingPrice(p as keyof typeof PROFESSIONS) !== null).length);
    expect(training.find((r) => r.startsWith('| Hardy Pioneer |'))).toContain('a pioneer with 100 tools');
  });

  it('purchases: ships and artillery from the unit table, then the dock kits', () => {
    const purchases = rows('purchases');
    expect(purchases.find((r) => r.includes('| Frigate |'))).toContain('| 5000 |');
    expect(purchases.find((r) => r.includes('| Artillery |'))).toContain('500, and 100 more for each one bought before');
    expect(purchases.find((r) => r.includes("Dragoon's kit"))).toContain('50 muskets and 50 horses at the asking price');
  });

  it('immigrant odds add up to the whole on every level', () => {
    const odds = rows('immigrant-odds');
    expect(odds).toHaveLength(DIFFICULTIES.length);
    for (const row of odds) {
      const shares = row.split(' | ').slice(1).map((c) => Number.parseInt(c, 10));
      expect(Math.abs(shares.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(2);
    }
  });

  it('the skilled draw lists every calling with its weight', () => {
    const skilled = rows('skilled-immigrants');
    const entries = Object.entries(SKILLED_IMMIGRANTS) as [keyof typeof PROFESSIONS, number][];
    expect(skilled).toHaveLength(entries.length);
    entries.forEach(([p, weight], i) => expect(skilled[i]).toMatch(new RegExp(`^\\| ${PROFESSIONS[p].name} \\| ${weight} \\| `)));
    expect(TABLES['skilled-immigrants']!()).toContain('Chance (out of 25)');
  });

  it('the tax events run from a cut to the Stamp Act', () => {
    const tax = rows('tax-events');
    expect(tax[0]).toBe('| A victory abroad | -5 to -2 points |');
    expect(tax.at(-1)).toBe('| A Stamp Act | +5 to +8 points |');
  });

  it('the expeditionary force matches the difficulty profiles', () => {
    const force = rows('expeditionary-force');
    DIFFICULTIES.forEach((d, i) => {
      const { name, ref } = difficultyProfile(d);
      expect(force[i]).toContain(`| ${name} | ${ref.regulars} | ${ref.cavalry} | ${ref.artillery} | ${ref.ships} |`);
    });
    expect(force[0]).toMatch(/\| 10 \| 2000 \|$/);
  });
});
