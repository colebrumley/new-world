import { describe, expect, it } from 'vitest';
import { MAPGEN } from '../../../../src/engine/data/mapgen';
import { seaLaneMask } from '../../../../src/engine/mapgen/sea-lane';

/** Rows of '#' (land) and '.' (water) to the mask drawn as '~' (Sea Lane) and '.' (other water). */
const lanes = (rows: readonly string[]): string[] => {
  const width = (rows[0] as string).length;
  const cell = (x: number, y: number): string => (rows[y] as string)[x] as string;
  const mask = seaLaneMask(width, rows.length, (x, y) => cell(x, y) === '#', (x, y) => cell(x, y) === '.');
  return rows.map((row, y) => [...row].map((c, x) => (c === '#' ? '#' : mask[y * width + x] ? '~' : '.')).join(''));
};

describe('seaLaneMask', () => {
  it('is set at three squares from land', () => {
    expect(MAPGEN.laneFromLand).toBe(3);
  });

  it('starts the set distance out from the nearest land, on both sides of the land', () => {
    const rows = Array.from({ length: 9 }, (_, y) => (y === 4 ? '.........##.........' : '....................'));
    const out = lanes(rows);
    // on the land's own row: two squares of Ocean, then the lane, on either side
    expect(out[4]).toBe('~~~~~~~..##..~~~~~~~');
    // a row with no land is lane wherever it is far enough from land
    expect(out[0]).toBe('~~~~~~~~~~~~~~~~~~~~');
    expect(out[2]).toBe('~~~~~~~......~~~~~~~');
  });

  it('leaves the sea between two lands Ocean, however wide', () => {
    const rows = Array.from({ length: 13 }, (_, y) => (y === 6 ? '..#..............#..' : '....................'));
    const out = lanes(rows);
    expect(out[6]).toBe('..#..............#..');
    // the land is too near the sides for a lane on its own row
    expect(out[6]?.includes('~')).toBe(false);
  });

  it('leaves a patch cut off from the sides Ocean', () => {
    const walled = '#..........#####';
    const rows = ['################', walled, walled, walled, '#...............', walled, walled, walled, walled, '################'];
    // the middle of the channel's row is far from land with none east of it, but the narrow way out is too near land
    expect(lanes(rows).join('').includes('~')).toBe(false);
    // widen the way out and the lane runs in from the side
    const open = lanes(rows.map((row, y) => (y >= 2 && y <= 6 ? '#...............' : row)));
    expect(open[4]).toBe('#..~~~~~~~~~~~~~');
  });
});
