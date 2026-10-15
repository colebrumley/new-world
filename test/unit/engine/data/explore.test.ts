import { describe, expect, it } from 'vitest';
import { EXPLORE } from '../../../../src/engine/data/explore';

describe('explore order table', () => {
  it('matches the snapshot and is whole numbers', () => {
    expect(EXPLORE).toMatchSnapshot();
    for (const [name, n] of Object.entries(EXPLORE)) expect(Number.isInteger(n) && n > 0, name).toBe(true);
  });
});
