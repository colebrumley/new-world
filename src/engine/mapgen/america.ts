// Builds the America scenario map (R-103): the hand-drawn coastline from data/america.ts with
// terrain detail generated the same way as a random world, steered toward the real regions.
import {
  AMERICA_COAST, AMERICA_EQUATOR_ROW, AMERICA_FOREST, AMERICA_MOISTURE, AMERICA_STARTS, AMERICA_TRIBE_SITES, AMERICA_TRIBES,
} from '../data/america';
import { DEFAULT_WORLD, MAP_HEIGHT, MAP_WIDTH } from '../data/mapgen';
import type { Rng } from '../rng';
import type { GameMap } from '../state';
import { isWater, type Relief, type Tile } from '../tile';
import { detailWorld } from './generate';

/** Playable coordinate to bordered-grid coordinate. */
export const toGrid = (p: readonly [number, number]): [number, number] => [p[0] + 1, p[1] + 1];

function coastMask(): boolean[] {
  const land = new Array<boolean>(MAP_WIDTH * MAP_HEIGHT).fill(false);
  for (const [row, spans] of Object.entries(AMERICA_COAST)) {
    for (const [x0, x1] of spans) {
      for (let x = x0; x <= x1; x++) land[(Number(row) + 1) * MAP_WIDTH + x + 1] = true;
    }
  }
  return land;
}

function westEdge(row: number): number | null {
  const spans = AMERICA_COAST[row];
  return spans && spans[0] ? spans[0][0] : null;
}

// Mountain spines: the Andes down the west coast of the southern continent, the Rockies near
// the western map edge, the Sierra Madre through Mexico, and the Appalachian hills.
function americaRelief(gx: number, gy: number): Relief | null {
  const x = gx - 1;
  const y = gy - 1;
  const west = westEdge(y);
  if (west === null) return null;
  if (y >= 36 && y <= 66) {
    if (x - west <= 1) return 'mountains';
    if (x - west === 2) return 'hills';
  }
  if (y >= 2 && y <= 19) {
    if (x === 3) return 'mountains';
    if (x === 2 || x === 4) return y % 3 === 0 ? 'mountains' : 'hills';
  }
  if (y >= 23 && y <= 31 && x - west === 2) return y % 2 === 0 ? 'mountains' : 'hills';
  if (y >= 13 && y <= 20 && x === 27 - Math.floor((y - 13) / 2)) return 'hills';
  return null;
}

type Box = readonly [number, number, number, number, number];

const boxSum = (boxes: readonly Box[]) => (gx: number, gy: number): number => {
  const x = gx - 1;
  const y = gy - 1;
  let delta = 0;
  for (const [x0, y0, x1, y1, d] of boxes) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) delta += d;
  return delta;
};

export function americaMap(rng: Rng): GameMap {
  const map = detailWorld(rng, coastMask(), DEFAULT_WORLD, {
    equatorY: AMERICA_EQUATOR_ROW + 1,
    moisture: boxSum(AMERICA_MOISTURE),
    forest: boxSum(AMERICA_FOREST),
    relief: americaRelief,
  });
  // Settlement sites must be habitable: level ground, no rumor underfoot.
  const tiles = [...map.tiles];
  for (const tribe of AMERICA_TRIBES) {
    for (const site of AMERICA_TRIBE_SITES[tribe]) {
      const [gx, gy] = toGrid(site);
      const i = gy * MAP_WIDTH + gx;
      const tile = tiles[i] as Tile;
      if (isWater(tile)) continue;
      const level = tile.relief === 'flat' && tile.base !== 'arctic';
      tiles[i] = { ...tile, base: tile.base === 'arctic' ? 'tundra' : tile.base, relief: 'flat', rumor: false, resource: level ? tile.resource : null };
    }
  }
  return { ...map, tiles };
}

/** Grid coordinates of each power's starting sea tile on the America map. */
export function americaStarts(): Record<keyof typeof AMERICA_STARTS, [number, number]> {
  return {
    england: toGrid(AMERICA_STARTS.england),
    france: toGrid(AMERICA_STARTS.france),
    spain: toGrid(AMERICA_STARTS.spain),
    netherlands: toGrid(AMERICA_STARTS.netherlands),
  };
}
