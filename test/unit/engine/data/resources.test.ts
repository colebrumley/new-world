import { describe, expect, it } from 'vitest';
import { RESOURCE_IDS, RESOURCES } from '../../../../src/engine/data/resources';

describe('resource table', () => {
  it('matches the snapshot', () => {
    expect(RESOURCES).toMatchSnapshot();
  });

  it('covers every id with a name and a value', () => {
    expect(Object.keys(RESOURCES).sort()).toEqual([...RESOURCE_IDS].sort());
    for (const id of RESOURCE_IDS) {
      expect(RESOURCES[id].name.length).toBeGreaterThan(0);
      expect(RESOURCES[id].aiValue).toBeGreaterThan(0);
    }
    expect(RESOURCES.silverDeposit.aiValue).toBe(12);
  });
});
