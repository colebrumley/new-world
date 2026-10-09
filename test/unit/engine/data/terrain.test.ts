import { describe, expect, it } from 'vitest';
import {
  applyEngineYieldAdjustments, baseYield, CLEARED_FROM, defensePercent, FOREST_TERRAINS, FORESTED_FROM,
  OPEN_TERRAINS, RAW_GOODS, TERRAIN, TERRAIN_IDS,
} from '../../../../src/engine/data/terrain';

describe('terrain table', () => {
  it('matches the snapshot', () => {
    expect(TERRAIN).toMatchSnapshot();
  });

  it('has 8 open types, their 8 forests, and 5 others, each with every field', () => {
    expect(TERRAIN_IDS).toHaveLength(21);
    expect(Object.keys(TERRAIN).sort()).toEqual([...TERRAIN_IDS].sort());
    for (const id of TERRAIN_IDS) {
      const t = TERRAIN[id];
      expect(t.name.length, id).toBeGreaterThan(0);
      for (const field of ['moveCost', 'defense', 'improve', 'aiValue'] as const) {
        expect(Number.isInteger(t[field]), `${id}.${field}`).toBe(true);
        expect(t[field], `${id}.${field}`).toBeGreaterThanOrEqual(0);
      }
      expect(t.moveCost, id).toBeGreaterThanOrEqual(1);
      expect(Object.keys(t.yields)).toEqual([...RAW_GOODS]);
      for (const g of RAW_GOODS) expect(Number.isInteger(t.yields[g]), `${id}.${g}`).toBe(true);
    }
    expect(TERRAIN_IDS.filter((id) => TERRAIN[id].water)).toEqual(['ocean', 'seaLane']);
  });

  it('pairs each forest with its open counterpart', () => {
    expect(CLEARED_FROM).toEqual({
      boreal: 'tundra', scrub: 'desert', mixed: 'plains', broadleaf: 'prairie',
      conifer: 'grassland', tropical: 'savannah', wetland: 'marsh', rain: 'swamp',
    });
    for (const open of OPEN_TERRAINS) {
      expect(TERRAIN[open].kind).toBe('open');
      expect(CLEARED_FROM[FORESTED_FROM[open]]).toBe(open);
    }
    for (const forest of FOREST_TERRAINS) {
      expect(TERRAIN[forest].kind).toBe('forest');
      expect(FORESTED_FROM[CLEARED_FROM[forest]]).toBe(forest);
    }
  });

  it('converts defense steps to percent', () => {
    expect(defensePercent('plains')).toBe(0);
    expect(defensePercent('marsh')).toBe(25);
    expect(defensePercent('mixed')).toBe(50);
    expect(defensePercent('rain')).toBe(75);
    expect(defensePercent('hills')).toBe(100);
    expect(defensePercent('mountains')).toBe(150);
  });
});

describe('engine yield adjustments', () => {
  it('gives a free colonist 5 food on Plains and 6 lumber in Mixed Forest', () => {
    expect(baseYield('plains', 'food')).toBe(5);
    expect(baseYield('mixed', 'lumber')).toBe(6);
  });

  it('adds food only where the table has some, and leaves other goods alone', () => {
    expect(baseYield('arctic', 'food')).toBe(0);
    expect(baseYield('ocean', 'food')).toBe(0);
    expect(baseYield('grassland', 'food')).toBe(3);
    expect(baseYield('boreal', 'lumber')).toBe(4);
    expect(baseYield('grassland', 'tobacco')).toBe(3);
    expect(baseYield('mountains', 'ore')).toBe(4);
    expect(baseYield('ocean', 'fish')).toBe(3);
  });

  it('can be switched off rule by rule', () => {
    const off = { foodPlusOne: false, lumberDoubled: false };
    expect(baseYield('plains', 'food', off)).toBe(4);
    expect(baseYield('mixed', 'lumber', off)).toBe(3);
    expect(applyEngineYieldAdjustments('food', 4, { foodPlusOne: true, lumberDoubled: false })).toBe(5);
    expect(applyEngineYieldAdjustments('lumber', 3, { foodPlusOne: false, lumberDoubled: true })).toBe(6);
  });
});
