import { describe, expect, it } from 'vitest';
import {
  AMERICA_CHARTS, AMERICA_EXTRAS_LEGEND, AMERICA_GROUND_LEGEND, AMERICA_RELIEF_LEGEND, AMERICA_RIVERS_LEGEND, AMERICA_STARTS,
  AMERICA_TRIBE_REGIONS, AMERICA_TRIBE_SITES, AMERICA_TRIBES,
} from '../../../../src/engine/data/america';
import { MAP_HEIGHT, MAP_WIDTH, MAPGEN } from '../../../../src/engine/data/mapgen';
import { RESOURCE_TERRAINS } from '../../../../src/engine/data/resources';
import { createGame } from '../../../../src/engine/game';
import { americaMap, americaStarts, chartsOf, readCharts, toGrid } from '../../../../src/engine/mapgen/america';
import { worldStats } from '../../../../src/engine/mapgen/generate';
import type { GameMap } from '../../../../src/engine/state';
import { isLand, isWater, makeTile, terrainOf, type Tile } from '../../../../src/engine/tile';

const map = americaMap();
const at = (m: GameMap, p: readonly [number, number]): Tile => m.tiles[p[1] * m.width + p[0]] as Tile;

const COLUMNS = MAP_WIDTH - 2;
const ROWS = MAP_HEIGHT - 2;
/** Every playable square, in playable coordinates. */
const SQUARES: [number, number][] = Array.from({ length: COLUMNS * ROWS }, (_, i) => [i % COLUMNS, Math.floor(i / COLUMNS)]);
const square = (p: readonly [number, number]): Tile => at(map, toGrid(p));
const inside = ([x, y]: readonly [number, number]): boolean => x >= 0 && y >= 0 && x < COLUMNS && y < ROWS;
const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;
const side = ([x, y]: readonly [number, number]): [number, number][] =>
  N4.map(([dx, dy]): [number, number] => [x + dx, y + dy]).filter(inside);
const key = (p: readonly [number, number]): string => p.join(',');
const solid = (t: Tile): boolean => isLand(t) && t.base !== 'arctic';
const chebyshev = (a: readonly [number, number], b: readonly [number, number]): number =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const SOLID = SQUARES.filter((p) => solid(square(p)));
const toSolid = (p: readonly [number, number]): number => Math.min(...SOLID.map((q) => chebyshev(p, q)));

describe('America map', () => {
  it('matches the chart snapshot and is deterministic', () => {
    const charts = chartsOf(map);
    for (const name of ['ground', 'relief', 'rivers', 'extras'] as const) expect(charts[name].join('\n')).toMatchSnapshot(name);
    expect(americaMap()).toEqual(map);
    expect(americaMap()).not.toBe(map);
    expect([map.width, map.height, map.tiles.length]).toEqual([MAP_WIDTH, MAP_HEIGHT, MAP_WIDTH * MAP_HEIGHT]);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (x > 0 && y > 0 && x < MAP_WIDTH - 1 && y < MAP_HEIGHT - 1) continue;
        expect(at(map, [x, y]), `border ${x},${y}`).toEqual(makeTile());
      }
    }
  });

  it('keeps the legends', () => {
    expect({ AMERICA_GROUND_LEGEND, AMERICA_RELIEF_LEGEND, AMERICA_RIVERS_LEGEND, AMERICA_EXTRAS_LEGEND }).toMatchSnapshot();
  });

  it('gives every game the same squares whatever the seed', () => {
    const fields = (t: Tile) => [t.base, t.forest, t.relief, t.river, t.resource, t.rumor];
    const players = [{ id: 'h', name: 'H', kind: 'human' as const }];
    const [a, b, c] = [1, 2, 3].map((seed) => createGame({ seed, scenario: 'america', players }).map.tiles.map(fields));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a).toEqual(map.tiles.map(fields));
  });

  it('round-trips the charts and rejects a malformed one', () => {
    expect(chartsOf(map)).toEqual({
      ground: [...AMERICA_CHARTS.ground], relief: [...AMERICA_CHARTS.relief],
      rivers: [...AMERICA_CHARTS.rivers], extras: [...AMERICA_CHARTS.extras],
    });
    for (const chart of Object.values(AMERICA_CHARTS)) {
      expect(chart).toHaveLength(ROWS);
      for (const row of chart) expect(row).toHaveLength(COLUMNS);
    }
    expect(() => readCharts({ ...AMERICA_CHARTS, ground: AMERICA_CHARTS.ground.slice(0, 69) })).toThrow(RangeError);
    expect(() => readCharts({ ...AMERICA_CHARTS, ground: AMERICA_CHARTS.ground.slice(0, 69) })).toThrow(/ground chart: row 69/);
    const bad = [...AMERICA_CHARTS.relief];
    bad[12] = `z${(bad[12] as string).slice(1)}`;
    expect(() => readCharts({ ...AMERICA_CHARTS, relief: bad })).toThrow(RangeError);
    expect(() => readCharts({ ...AMERICA_CHARTS, relief: bad })).toThrow(/relief chart: row 12/);
  });

  it('puts relief, rivers, resources and rumors only where their rules allow', () => {
    const rumors: [number, number][] = [];
    for (const p of SQUARES) {
      const t = square(p);
      const where = key(p);
      if (t.relief !== 'flat' || t.river !== 'none') expect(solid(t), where).toBe(true);
      if (t.relief !== 'flat') expect(t.forest, where).toBe(false);
      if (t.resource) {
        expect(RESOURCE_TERRAINS[t.resource], where).toContain(terrainOf(t));
        if (t.resource === 'fishery') expect(toSolid(p), where).toBeLessThanOrEqual(2);
      }
      if (t.rumor) {
        expect([solid(t), t.relief === 'mountains', t.resource], where).toEqual([true, false, null]);
        rumors.push(p);
      }
    }
    for (const a of rumors) for (const b of rumors) if (a !== b) expect(chebyshev(a, b), `${key(a)} ${key(b)}`).toBeGreaterThanOrEqual(3);
  });

  it('runs every river at least two squares, and every one to the water but the transcribed stranded ones', () => {
    const river = SQUARES.filter((p) => square(p).river !== 'none');
    const isRiver = new Set(river.map(key));
    // Runs of one kind, 4-connected.
    const seen = new Set<string>();
    for (const start of river) {
      if (seen.has(key(start))) continue;
      const kind = square(start).river;
      const run = [start];
      seen.add(key(start));
      for (let i = 0; i < run.length; i++) {
        for (const n of side(run[i] as [number, number])) {
          if (!seen.has(key(n)) && square(n).river === kind) {
            seen.add(key(n));
            run.push(n);
          }
        }
      }
      expect(run.length, `${kind} run at ${key(start)}`).toBeGreaterThanOrEqual(2);
    }
    // Every river square walks over river squares to one beside water.
    const reaches = new Set(river.filter((p) => side(p).some((n) => isWater(square(n)))).map(key));
    const frontier = [...reaches];
    while (frontier.length > 0) {
      const p = (frontier.pop() as string).split(',').map(Number) as [number, number];
      for (const n of side(p)) {
        if (isRiver.has(key(n)) && !reaches.has(key(n))) {
          reaches.add(key(n));
          frontier.push(key(n));
        }
      }
    }
    // The charts were transcribed from the old generated map, whose river walks could stall
    // inland. These squares are kept as transcribed; R-1050 redraws the rivers and empties this list.
    const STRANDED = [
      '2,3', '3,3', '5,3', '6,3', '2,5', '3,5', '12,5', '13,5', '2,6', '5,6', '5,7', '16,9', '16,10', '7,11', '8,11',
      '29,13', '15,14', '16,14', '20,14', '21,14', '29,14', '12,20', '12,21', '11,23', '12,23', '15,26', '15,27',
      '31,41', '32,41', '29,44', '29,45', '39,45', '40,45', '50,46', '51,46', '32,47', '33,47', '49,47', '50,47',
      '46,49', '47,49', '46,51', '47,51', '33,54', '33,55', '37,56', '38,56', '38,61', '39,61',
    ];
    expect(river.map(key).filter((k) => !reaches.has(k))).toEqual(STRANDED);
  });

  // Pending until R-1050 redraws the rivers: then STRANDED above is empty and this is that check.
  it.todo('lets every river square walk over river squares to one beside water');

  it('marks Sea Lane exactly in the lane columns away from land', () => {
    const lane = (x: number): boolean => x < MAPGEN.westLaneColumns || x >= COLUMNS - MAPGEN.eastLaneColumns;
    for (const p of SQUARES) {
      const t = square(p);
      if (!isWater(t)) continue;
      const want = lane(p[0]) && toSolid(p) > MAPGEN.laneLandGap;
      expect(t.base === 'seaLane', key(p)).toBe(want);
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
