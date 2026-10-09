import { describe, expect, it } from 'vitest';
import { landmassAt, landmasses } from '../../../src/engine/regions';
import { setTile, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~', '~..~~.~~', '~.~~~~.~', '~~~.~~~~', '~~~~~~~~'];

describe('landmasses', () => {
  it('numbers each body of land in reading order; water is 0', () => {
    const { map } = world({ rows: ROWS });
    expect(landmassAt(map, 0, 0)).toBe(0);
    expect(landmassAt(map, 1, 1)).toBe(1);
    expect(landmassAt(map, 2, 1)).toBe(1);
    expect(landmassAt(map, 1, 2)).toBe(1);
    // touching only at a corner is still one landmass
    expect(landmassAt(map, 5, 1)).toBe(2);
    expect(landmassAt(map, 6, 2)).toBe(2);
    expect(landmassAt(map, 3, 3)).toBe(3);
    expect(landmassAt(map, -1, 2)).toBe(0);
    expect(landmassAt(map, 8, 2)).toBe(0);
  });

  it('is worked out once per map and afresh when the land changes', () => {
    const s = world({ rows: ROWS });
    expect(landmasses(s.map)).toBe(landmasses(s.map));
    const joined = setTile(s, 2, 2, { base: 'plains' });
    expect(landmassAt(joined.map, 3, 3)).toBe(1);
    expect(landmassAt(s.map, 3, 3)).toBe(3);
  });
});
