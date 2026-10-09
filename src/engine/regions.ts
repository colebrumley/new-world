// Landmasses: every land square belongs to one, and two squares share one when a unit could
// walk between them (diagonals count). Worked out from the map when asked and remembered per
// map, so nothing about it is stored in the game.
import type { GameMap } from './state';
import { isWater, type Tile } from './tile';

const cache = new WeakMap<readonly Tile[], Int16Array>();

/** The landmass number of every square: 0 for water, 1 upward for land, numbered in reading order. */
export function landmasses(map: GameMap): Int16Array {
  const known = cache.get(map.tiles);
  if (known) return known;
  const { width, height, tiles } = map;
  const ids = new Int16Array(width * height);
  let count = 0;
  const stack: number[] = [];
  for (let start = 0; start < tiles.length; start++) {
    if (ids[start] !== 0 || isWater(tiles[start] as Tile)) continue;
    count++;
    ids[start] = count;
    stack.push(start);
    while (stack.length > 0) {
      const at = stack.pop() as number;
      const x = at % width;
      const y = (at - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (ids[next] !== 0 || isWater(tiles[next] as Tile)) continue;
          ids[next] = count;
          stack.push(next);
        }
      }
    }
  }
  cache.set(map.tiles, ids);
  return ids;
}

/** The landmass a square belongs to; 0 for water and for anything off the map. */
export function landmassAt(map: GameMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return landmasses(map)[y * map.width + x] as number;
}
