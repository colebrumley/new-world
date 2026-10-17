// Where the Sea Lane lies (R-102; docs/RULES.md "Sea Lane"): the open sea a fixed number of squares
// out from the nearest land, toward either side of the map, or nearer in the side columns. The random generator marks it with this
// rule and the America chart is drawn to it.
import { MAPGEN } from '../data/mapgen';

/**
 * For each square of a `width` x `height` grid (row by row), whether it is Sea Lane: water at
 * least `MAPGEN.laneFromLand` squares from every land square (counting diagonal steps as one), or
 * `laneNearLand` within the side columns (`westLaneColumns` and `eastLaneColumns` of the playable
 * area, the rim column too), with no land between it and the west side or the east side of the map on its row, and joined
 * (diagonals too) through such squares to one beside a side of the map. `land` says which squares count as land; arctic is left out by the callers.
 */
export function seaLaneMask(width: number, height: number, land: (x: number, y: number) => boolean, water: (x: number, y: number) => boolean): boolean[] {
  const n = width * height;
  const toLand = new Array<number>(n).fill(Infinity);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) {
    if (land(i % width, Math.floor(i / width))) {
      toLand[i] = 0;
      frontier.push(i);
    }
  }
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (toLand[j] === Infinity) {
            toLand[j] = (toLand[i] as number) + 1;
            next.push(j);
          }
        }
      }
    }
    frontier = next;
  }
  const lane = new Array<boolean>(n).fill(false);
  for (let y = 0; y < height; y++) {
    let first = width;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (!land(x, y)) continue;
      first = Math.min(first, x);
      last = x;
    }
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const side = x <= MAPGEN.westLaneColumns || x >= width - 1 - MAPGEN.eastLaneColumns;
      const near = side ? MAPGEN.laneNearLand : MAPGEN.laneFromLand;
      if ((x < first || x > last) && water(x, y) && (toLand[i] as number) >= near) lane[i] = true;
    }
  }
  // a patch cut off from both sides (a wide bay or strait) stays Ocean
  const kept = new Array<boolean>(n).fill(false);
  let reach: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % width;
    if (lane[i] && (x <= 1 || x >= width - 2)) {
      kept[i] = true;
      reach.push(i);
    }
  }
  while (reach.length > 0) {
    const next: number[] = [];
    for (const i of reach) {
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (lane[j] && !kept[j]) {
            kept[j] = true;
            next.push(j);
          }
        }
      }
    }
    reach = next;
  }
  return kept;
}
