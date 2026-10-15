import { describe, expect, it } from 'vitest';
import { chiefSpokeText, type ChiefSpoke } from '../../../src/ui/village-text';

const spoke = (outcome: ChiefSpoke['outcome'], extra: Partial<ChiefSpoke> = {}): ChiefSpoke =>
  ({ type: 'chiefSpoke', unitId: 'u1', settlementId: 's1', outcome, gold: 0, wants: ['cloth', 'muskets'], skill: 'expertFarmer', ...extra });

describe('what a chief said', () => {
  it('gives the result, then what his people want and teach', () => {
    expect(chiefSpokeText(spoke('gift', { gold: 75 }))).toBe('The chief sent us away with gifts worth 75 gold. His people would trade for Cloth, Muskets. They can teach the trade of the Expert Farmer.');
    expect(chiefSpokeText(spoke('tales', { wants: [] }))).toBe('The chief told tales of the lands around, now marked on our map. They can teach the trade of the Expert Farmer.');
    expect(chiefSpokeText(spoke('nothing'))).toMatch(/^The chief had little to say\. His people/);
    expect(chiefSpokeText(spoke('promotion'))).toMatch(/^The chief taught our scout the ways of the land: a Seasoned Scout\./);
  });

  it('says only that the scout was killed', () => {
    expect(chiefSpokeText(spoke('killed'))).toBe('The scout was put to death as a spy.');
  });
});
