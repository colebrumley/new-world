import { describe, expect, it } from 'vitest';
import { dateOfTurn, formatDate } from '../../../src/engine/calendar';

describe('calendar', () => {
  it('runs one turn per year from 1492 to 1599, then spring and autumn', () => {
    expect(dateOfTurn(0)).toEqual({ year: 1492, season: null });
    expect(dateOfTurn(107)).toEqual({ year: 1599, season: null });
    expect(dateOfTurn(108)).toEqual({ year: 1600, season: 'spring' });
    expect(dateOfTurn(109)).toEqual({ year: 1600, season: 'autumn' });
    expect(dateOfTurn(110)).toEqual({ year: 1601, season: 'spring' });
    expect(dateOfTurn(108 + 400)).toEqual({ year: 1800, season: 'spring' });
    expect(formatDate(dateOfTurn(3))).toBe('1495');
    expect(formatDate(dateOfTurn(109))).toBe('Autumn 1600');
  });
});
