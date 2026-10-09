import { describe, expect, it } from 'vitest';
import { AMERICA_COAST, AMERICA_STARTS, AMERICA_TRIBE_REGIONS, AMERICA_TRIBE_SITES, AMERICA_TRIBES } from '../../../../src/engine/data/america';
import { MAP_HEIGHT, MAP_WIDTH } from '../../../../src/engine/data/mapgen';
import { RESOURCE_TERRAINS } from '../../../../src/engine/data/resources';
import { americaMap, americaStarts, toGrid } from '../../../../src/engine/mapgen/america';
import { worldStats } from '../../../../src/engine/mapgen/generate';
import { createRng } from '../../../../src/engine/rng';
import type { GameMap } from '../../../../src/engine/state';
import { isLand, isWater, terrainOf, type Tile } from '../../../../src/engine/tile';

const map = americaMap(createRng('america').fork('world'));
const at = (m: GameMap, p: readonly [number, number]): Tile => m.tiles[p[1] * m.width + p[0]] as Tile;

const GLYPH: Record<string, string> = {
  ocean: ' ', seaLane: '~', arctic: '#', tundra: 't', desert: 'd', plains: 'p', prairie: 'r', grassland: 'g',
  savannah: 's', marsh: 'm', swamp: 'w', boreal: 'T', scrub: 'D', mixed: 'P', broadleaf: 'R', conifer: 'G',
  tropical: 'S', wetland: 'M', rain: 'W', hills: 'h', mountains: 'A',
};

function ascii(m: GameMap): string {
  const rows: string[] = [];
  for (let y = 0; y < m.height; y++) {
    let row = '';
    for (let x = 0; x < m.width; x++) row += GLYPH[terrainOf(at(m, [x, y]))];
    rows.push(row.replace(/\s+$/, ''));
  }
  return rows.join('\n');
}

describe('America map', () => {
  it('matches the terrain snapshot and is deterministic', () => {
    expect(ascii(map)).toMatchSnapshot();
    expect(americaMap(createRng('america').fork('world'))).toEqual(map);
    expect([map.width, map.height]).toEqual([MAP_WIDTH, MAP_HEIGHT]);
  });

  it('follows the authored coastline exactly', () => {
    for (let y = 1; y < MAP_HEIGHT - 3; y++) {
      const spans = AMERICA_COAST[y - 1] ?? [];
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const want = spans.some(([x0, x1]) => x - 1 >= x0 && x - 1 <= x1);
        const t = at(map, [x, y]);
        if (t.base === 'arctic') continue; // polar caps
        expect(isLand(t), `${x - 1},${y - 1}`).toBe(want);
      }
    }
  });

  it('keeps every land mass reachable from the sea and within the continent limit', () => {
    const stats = worldStats(map);
    expect(stats.landlocked).toBe(0);
    expect(stats.landMasses).toBeLessThanOrEqual(15);
    expect(stats.rumors).toBeGreaterThanOrEqual(10);
  });

  it('has a recognizable Florida, Gulf of Mexico, Caribbean and Panama', () => {
    expect(isLand(at(map, toGrid([27, 24])))).toBe(true); // Florida
    expect(isWater(at(map, toGrid([22, 24])))).toBe(true); // Gulf of Mexico
    expect(isWater(at(map, toGrid([29, 24])))).toBe(true); // Atlantic east of Florida
    expect(isLand(at(map, toGrid([32, 25])))).toBe(true); // Cuba
    expect(isWater(at(map, toGrid([33, 31])))).toBe(true); // Caribbean Sea
    expect(isLand(at(map, toGrid([26, 34])))).toBe(true); // isthmus
    expect(isWater(at(map, toGrid([20, 40])))).toBe(true); // Pacific
    expect(isLand(at(map, toGrid([45, 45])))).toBe(true); // Brazil
  });

  it("puts every tribe's sites on level land inside its region box", () => {
    for (const tribe of AMERICA_TRIBES) {
      const [x0, y0, x1, y1] = AMERICA_TRIBE_REGIONS[tribe];
      expect(AMERICA_TRIBE_SITES[tribe].length).toBeGreaterThanOrEqual(4);
      for (const site of AMERICA_TRIBE_SITES[tribe]) {
        const where = `${tribe} ${site.join(',')}`;
        expect(site[0] >= x0 && site[0] <= x1 && site[1] >= y0 && site[1] <= y1, where).toBe(true);
        const t = at(map, toGrid(site));
        expect(isLand(t), where).toBe(true);
        expect([t.relief, t.rumor, t.base === 'arctic'], where).toEqual(['flat', false, false]);
        if (t.resource) expect(RESOURCE_TERRAINS[t.resource]).toContain(terrainOf(t));
      }
    }
    const all = AMERICA_TRIBES.flatMap((t) => AMERICA_TRIBE_SITES[t].map((s) => s.join(',')));
    expect(new Set(all).size).toBe(all.length);
  });

  it('starts the four powers at sea in the listed spots, north to south France, England, Netherlands, Spain', () => {
    const starts = americaStarts();
    for (const [nation, p] of Object.entries(starts)) expect(isWater(at(map, p)), nation).toBe(true);
    expect(Object.keys(AMERICA_STARTS)).toEqual(['england', 'france', 'spain', 'netherlands']);
    expect(starts.france[1]).toBeLessThan(starts.england[1]);
    expect(starts.england[1]).toBeLessThan(starts.netherlands[1]);
    expect(starts.netherlands[1]).toBeLessThan(starts.spain[1]);
  });

  it('has the regional character: Andes, a dry south-west, a wet Amazon, cold north', () => {
    const count = (x0: number, y0: number, x1: number, y1: number, pred: (t: Tile) => boolean): number => {
      let n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (pred(at(map, toGrid([x, y])))) n++;
      return n;
    };
    expect(count(26, 36, 35, 66, (t) => t.relief === 'mountains')).toBeGreaterThan(40);
    const dry = (t: Tile): boolean => t.base === 'desert' || t.base === 'prairie';
    const wet = (t: Tile): boolean => t.base === 'swamp' || t.base === 'savannah' || t.base === 'marsh';
    expect(count(4, 15, 17, 23, dry)).toBeGreaterThan(count(4, 15, 17, 23, wet) * 3);
    expect(count(34, 37, 49, 47, wet)).toBeGreaterThan(count(34, 37, 49, 47, dry) * 3);
    expect(count(0, 1, 20, 3, (t) => t.base === 'tundra')).toBeGreaterThan(20);
    expect(count(0, 0, 55, 69, (t) => t.base === 'seaLane')).toBeGreaterThan(300);
  });
});
