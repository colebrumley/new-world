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
const sea = (width: number, height: number, land: readonly (readonly [number, number])[]): string[] =>
  Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (land.some(([lx, ly]) => lx === x && ly === y) ? '#' : '.')).join(''));

describe('seaLaneMask', () => {
  it('is set at six squares from land, three in the side columns', () => {
    expect([MAPGEN.laneFromLand, MAPGEN.laneNearLand, MAPGEN.westLaneColumns, MAPGEN.eastLaneColumns]).toEqual([6, 3, 3, 7]);
  });

  it('starts the set distance out from the nearest land, on both sides of the land', () => {
    const out = lanes(sea(40, 25, [[19, 12], [20, 12]]));
    // on the land's own row: five squares of Ocean, then the lane, on either side
    expect(out[12]).toBe(`${'~'.repeat(14)}${'.'.repeat(5)}##${'.'.repeat(5)}${'~'.repeat(14)}`);
    // four rows off, the lane begins as far out
    expect(out[8]).toBe(`${'~'.repeat(14)}${'.'.repeat(12)}${'~'.repeat(14)}`);
    // a row far enough from all land is lane right across
    expect(out[0]).toBe('~'.repeat(40));
  });

  it('comes nearer, to three squares, where land lies close to a side', () => {
    const out = lanes(sea(30, 13, [[24, 6]]));
    expect(out[6]).toBe(`${'~'.repeat(19)}${'.'.repeat(5)}#..~~~`);
  });

  it('leaves the sea between two lands Ocean, however wide', () => {
    const out = lanes(sea(40, 21, [[5, 10], [34, 10]]));
    expect(out[10]).toBe(`~~~..#${'.'.repeat(28)}#..~~~`);
  });

  it('leaves a patch cut off from the sides Ocean', () => {
    // a wide basin far from land, whose only way out is a one-row channel too near land
    const rows = Array.from({ length: 30 }, (_, y) => {
      if (y === 0 || y === 29) return '#'.repeat(40);
      if (y === 15) return `#${'.'.repeat(39)}`;
      return `#${'.'.repeat(30)}${'#'.repeat(9)}`;
    });
    expect(lanes(rows).join('').includes('~')).toBe(false);
  });
});
