import { describe, expect, it } from 'vitest';
import {
  alarmLevel, ATTITUDE_ADVERBS, ATTITUDES, CAPITAL_NAME, MAX_SETTLEMENTS, NATIVES, OTHER_TRIBE_NAMES, settlementPopulation, TECH_LEVELS, TRIBE_IDS, TRIBES,
} from '../../../../src/engine/data/tribes';

describe('tribes table', () => {
  it('matches the snapshot', () => {
    expect({ TRIBES, TECH_LEVELS, CAPITAL_NAME, NATIVES, ATTITUDES, ATTITUDE_ADVERBS, OTHER_TRIBE_NAMES, MAX_SETTLEMENTS }).toMatchSnapshot();
  });

  it('has eight tribes: three camp peoples, three village peoples and two city peoples', () => {
    expect(TRIBE_IDS).toHaveLength(8);
    const by = (tech: number): string[] => TRIBE_IDS.filter((t) => TRIBES[t].tech === tech);
    expect(by(0)).toEqual(['apache', 'sioux', 'tupi']);
    expect(by(1)).toEqual(['arawak', 'iroquois', 'cherokee']);
    expect(by(2)).toEqual(['aztec']);
    expect(by(3)).toEqual(['inca']);
    expect(TRIBE_IDS.map((t) => TECH_LEVELS[TRIBES[t].tech].settlement)).toEqual(['City', 'City', 'Village', 'Village', 'Village', 'Camp', 'Camp', 'Camp']);
  });

  it('camps and villages hold the squares around them; cities reach further', () => {
    expect(TRIBE_IDS.map((t) => TRIBES[t].landRadius)).toEqual([3, 2, 1, 1, 1, 1, 1, 1]);
  });

  it('settlements start at 3 + 2 per tech level, and capitals can grow beyond that', () => {
    expect(TRIBE_IDS.map((t) => settlementPopulation(t, false).start)).toEqual([9, 7, 5, 5, 5, 3, 3, 3]);
    expect(TRIBE_IDS.map((t) => settlementPopulation(t, false).max)).toEqual([9, 7, 5, 5, 5, 3, 3, 3]);
    expect(TRIBE_IDS.map((t) => settlementPopulation(t, true).max)).toEqual([13, 10, 7, 7, 7, 4, 4, 4]);
    expect(settlementPopulation('inca', true).start).toBe(9);
  });

  it('alarm steps through four levels at 25, 50 and 75', () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(alarmLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('names five attitudes and five degrees', () => {
    expect(ATTITUDES).toEqual(['Content', 'Uneasy', 'Restless', 'Angry', 'War']);
    expect(ATTITUDE_ADVERBS).toHaveLength(5);
  });
});
