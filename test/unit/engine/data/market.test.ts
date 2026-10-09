import { describe, expect, it } from 'vitest';
import { GOOD_IDS } from '../../../../src/engine/data/goods';
import { IMMIGRANT_CLASSES, MARKET } from '../../../../src/engine/data/market';
import { NATION_IDS, NATIONS } from '../../../../src/engine/data/nations';
import { createGame } from '../../../../src/engine/game';

describe('market table', () => {
  it('matches the snapshot and covers every good', () => {
    expect({ MARKET, IMMIGRANT_CLASSES }).toMatchSnapshot();
    expect(Object.keys(MARKET)).toEqual([...GOOD_IDS]);
    for (const good of GOOD_IDS) {
      const m = MARKET[good];
      expect(m.start[0], good).toBeLessThanOrEqual(m.start[1]);
      expect(m.low, good).toBeLessThanOrEqual(m.start[0]);
      expect(m.high, good).toBeGreaterThanOrEqual(m.start[1]);
    }
    expect(MARKET.food).toMatchObject({ start: [1, 3], burden: 7, attrition: -1 });
    expect(MARKET.silver).toMatchObject({ start: [20, 20], low: 2, high: 20, rise: 8, fall: 1, volatility: 2 });
    expect(MARKET.muskets).toMatchObject({ start: [3, 3], high: 20, attrition: 6 });
  });
});

describe('nations', () => {
  it('lists the four powers with their names, ports and leaders', () => {
    expect(NATIONS).toMatchSnapshot();
    expect(NATION_IDS).toEqual(['england', 'france', 'spain', 'netherlands']);
    expect(NATION_IDS.map((n) => NATIONS[n].homePort)).toEqual(['London', 'La Rochelle', 'Seville', 'Amsterdam']);
  });

  it('are dealt to players in order, honouring a choice', () => {
    const p = (id: string, nation?: 'spain') => ({ id, name: id, kind: 'ai' as const, ...(nation ? { nation } : {}) });
    expect(createGame({ seed: 1, players: [p('a'), p('b'), p('c'), p('d')] }).players.map((x) => x.nation)).toEqual(['england', 'france', 'spain', 'netherlands']);
    expect(createGame({ seed: 1, players: [p('a'), p('b', 'spain'), p('c')] }).players.map((x) => x.nation)).toEqual(['england', 'spain', 'france']);
    const america = createGame({ seed: 1, scenario: 'america', players: [p('a', 'spain'), p('b')] });
    const ships = Object.values(america.units).filter((u) => u.type === 'caravel');
    expect(ships.map((s) => [s.x, s.y])).toEqual([[48, 62], [35, 21]]); // Spain's start, then England's
  });
});
