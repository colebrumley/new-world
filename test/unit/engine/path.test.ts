import { describe, expect, it } from 'vitest';
import { findPath, type StepCost } from '../../../src/engine/path';
import { makeTile } from '../../../src/engine/tile';

// Fixture map: '.' open (cost 3), '#' wall, '=' road (cost 1), '^' rough (cost 9).
function fixture(rows: string[]): { map: { width: number; height: number; tiles: ReturnType<typeof makeTile>[] }; cost: StepCost } {
  const width = rows[0]!.length;
  const height = rows.length;
  const cell = (x: number, y: number): string => rows[y]![x]!;
  const cost: StepCost = (_fx, _fy, tx, ty) => {
    const c = cell(tx, ty);
    return c === '#' ? null : c === '=' ? 1 : c === '^' ? 9 : 3;
  };
  return { map: { width, height, tiles: Array.from({ length: width * height }, () => makeTile()) }, cost };
}

describe('findPath', () => {
  it('returns an empty path to itself and a straight diagonal on open ground', () => {
    const { map, cost } = fixture(['.....', '.....', '.....', '.....', '.....']);
    expect(findPath(map, 2, 2, 2, 2, cost, { minStep: 1 })).toEqual({ steps: [], cost: 0 });
    const p = findPath(map, 0, 0, 4, 4, cost, { minStep: 1 });
    expect(p?.steps).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(p?.cost).toBe(12);
  });

  it('walks around walls and reports no path when sealed off', () => {
    const { map, cost } = fixture([
      '..#..',
      '..#..',
      '..#..',
      '.....',
    ]);
    const p = findPath(map, 0, 0, 4, 0, cost, { minStep: 1 });
    expect(p?.steps.at(-1)).toEqual([4, 0]);
    expect(p?.steps).toHaveLength(6);
    expect(p?.steps.every(([x, y]) => !(x === 2 && y < 3))).toBe(true);
    const sealed = fixture(['..#..', '..#..', '..#..']);
    expect(findPath(sealed.map, 0, 0, 4, 0, sealed.cost, { minStep: 1 })).toBeNull();
  });

  it('prefers a longer road to a shorter rough crossing', () => {
    const { map, cost } = fixture([
      '.^^^.',
      '.^^^.',
      '=====',
    ]);
    const p = findPath(map, 0, 0, 4, 0, cost, { minStep: 1 });
    expect(p?.cost).toBe(3 + 1 + 1 + 1 + 3 + 3); // down the open edge, along the road, back up
    expect(p?.steps).toEqual([[0, 1], [1, 2], [2, 2], [3, 2], [4, 1], [4, 0]]);
  });

  it('gives up past the expansion limit', () => {
    const { map, cost } = fixture(Array.from({ length: 20 }, () => '.'.repeat(20)));
    expect(findPath(map, 0, 0, 19, 19, cost, { minStep: 1, maxExpanded: 5 })).toBeNull();
    expect(findPath(map, 0, 0, 19, 19, cost, { minStep: 1 })?.steps).toHaveLength(19);
  });
});
