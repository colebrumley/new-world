import { describe, expect, it } from 'vitest';
import { CHEATS } from '../../../../src/engine/data/cheats';

describe('cheat defaults', () => {
  it('match the snapshot and are whole numbers above nothing', () => {
    expect(CHEATS).toMatchSnapshot();
    expect(Object.keys(CHEATS)).toEqual(['gold', 'crosses', 'bells', 'revealRadius', 'treasureGold', 'most']);
    for (const [name, n] of Object.entries(CHEATS)) expect(Number.isInteger(n) && n > 0, name).toBe(true);
  });
});
