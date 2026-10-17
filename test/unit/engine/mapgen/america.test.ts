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
import { seaLaneMask } from '../../../../src/engine/mapgen/sea-lane';
import { isSettlementGround } from '../../../../src/engine/mapgen/settlements';
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
const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
const around = ([x, y]: readonly [number, number]): [number, number][] =>
  N8.map(([dx, dy]): [number, number] => [x + dx, y + dy]).filter(inside);

/** Grow a set of squares from `start` over neighbours that `member` admits. */
function flood(start: readonly (readonly [number, number])[], member: (p: readonly [number, number]) => boolean,
  next: (p: readonly [number, number]) => [number, number][]): [number, number][] {
  const out = start.map((p): [number, number] => [p[0], p[1]]);
  const seen = new Set(out.map(key));
  for (let i = 0; i < out.length; i++) {
    for (const n of next(out[i] as [number, number])) {
      if (!seen.has(key(n)) && member(n)) {
        seen.add(key(n));
        out.push(n);
      }
    }
  }
  return out;
}

/** The 8-connected water bodies of the playable area. */
function waterBodies(): [number, number][][] {
  const done = new Set<string>();
  const bodies: [number, number][][] = [];
  for (const p of SQUARES) {
    if (done.has(key(p)) || !isWater(square(p))) continue;
    const body = flood([p], (q) => isWater(square(q)), around);
    for (const q of body) done.add(key(q));
    bodies.push(body);
  }
  return bodies;
}

/** The main ocean: water joined to the plain-ocean border ring, so to any water square on the playable edge. */
const OCEAN = new Set(flood(SQUARES.filter((p) => isWater(square(p)) && (p[0] === 0 || p[1] === 0 || p[0] === COLUMNS - 1 || p[1] === ROWS - 1)),
  (q) => isWater(square(q)), around).map(key));

/** Every river run of one kind: a 4-connected set of its squares, as large as it can be. */
function runs(kind: 'minor' | 'major'): [number, number][][] {
  const done = new Set<string>();
  const out: [number, number][][] = [];
  for (const p of SQUARES) {
    if (done.has(key(p)) || square(p).river !== kind) continue;
    const run = flood([p], (q) => square(q).river === kind, side);
    for (const q of run) done.add(key(q));
    out.push(run);
  }
  return out;
}

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

  it('runs every river at least two squares, and every square of it to the water', () => {
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
    expect(river.map(key).filter((k) => !reaches.has(k))).toEqual([]);
  });

  it('marks Sea Lane exactly where the generator puts it: the outer open sea from the set distance off land', () => {
    const lane = seaLaneMask(MAP_WIDTH, MAP_HEIGHT, (x, y) => solid(at(map, [x, y])), (x, y) => isWater(at(map, [x, y])));
    for (const p of SQUARES) {
      const [gx, gy] = toGrid(p);
      expect(square(p).base === 'seaLane', key(p)).toBe(lane[gy * MAP_WIDTH + gx]);
      if (square(p).base === 'seaLane') expect(toSolid(p), key(p)).toBeGreaterThanOrEqual(MAPGEN.laneFromLand);
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
    for (const [nation, p] of Object.entries(starts)) {
      expect(at(map, p).base, nation).toBe('seaLane');
      // Ocean in sight, so that an exploring ship has somewhere to go off the Sea Lane
      expect(around([p[0] - 1, p[1] - 1]).some((q) => square(q).base === 'ocean'), nation).toBe(true);
    }
    expect(Object.keys(AMERICA_STARTS)).toEqual(['england', 'france', 'spain', 'netherlands']);
    expect(starts.france[1]).toBeLessThan(starts.england[1]);
    expect(starts.england[1]).toBeLessThan(starts.netherlands[1]);
    expect(starts.netherlands[1]).toBeLessThan(starts.spain[1]);
  });

  it('has the regional character: a dry south-west, a wet Amazon, a cold north, wide seas', () => {
    const count = (x0: number, y0: number, x1: number, y1: number, pred: (t: Tile) => boolean): number => {
      let n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (pred(square([x, y]))) n++;
      return n;
    };
    const dry = (t: Tile): boolean => t.base === 'desert' || t.base === 'prairie';
    const wet = (t: Tile): boolean => t.base === 'swamp' || t.base === 'savannah' || t.base === 'marsh';
    expect(count(2, 15, 14, 24, dry)).toBeGreaterThanOrEqual(count(2, 15, 14, 24, wet) * 3);
    expect(count(32, 38, 48, 48, wet)).toBeGreaterThanOrEqual(count(32, 38, 48, 48, dry) * 3);
    expect(count(0, 1, 20, 3, (t) => t.base === 'tundra')).toBeGreaterThanOrEqual(20);
    expect(count(0, 0, COLUMNS - 1, ROWS - 1, (t) => t.base === 'seaLane')).toBeGreaterThanOrEqual(300);
    const stats = worldStats(map);
    expect(stats.landMasses).toBeLessThanOrEqual(15);
    expect(stats.landlocked).toBe(0);
  });

  it('lets a ship round Cape Horn on rows 60 to 68', () => {
    const lane = (x: number, east: boolean): boolean => (east ? x >= COLUMNS - MAPGEN.eastSeaColumns : x < MAPGEN.westSeaColumns);
    const rows = (p: readonly [number, number]): boolean => p[1] >= 60 && p[1] <= 68;
    const start = SQUARES.filter((p) => rows(p) && lane(p[0], true) && square(p).base === 'seaLane');
    const seen = new Set(start.map(key));
    const queue = [...start];
    while (queue.length > 0) {
      const p = queue.shift() as [number, number];
      for (const n of around(p)) {
        if (rows(n) && isWater(square(n)) && !seen.has(key(n))) {
          seen.add(key(n));
          queue.push(n);
        }
      }
    }
    expect(SQUARES.some((p) => rows(p) && lane(p[0], false) && square(p).base === 'seaLane' && seen.has(key(p)))).toBe(true);
  });

  it('runs the Mississippi from the northern plains to the Gulf, with two tributaries', () => {
    const gulf = (p: readonly [number, number]): boolean => p[0] >= 14 && p[0] <= 25 && p[1] >= 19 && p[1] <= 27 && OCEAN.has(key(p));
    const mississippi = runs('major').find((run) => run.some((p) => side(p).some(gulf)));
    expect(mississippi).toBeDefined();
    const run = mississippi as [number, number][];
    expect(Math.min(...run.map((p) => p[1]))).toBeLessThanOrEqual(8);
    const inRun = new Set(run.map(key));
    const tributaries = runs('minor').filter((minor) => minor.some((p) => side(p).some((n) => inRun.has(key(n)))));
    expect(tributaries.length).toBeGreaterThanOrEqual(2);
  });

  it('has the Great Lakes, the St Lawrence and Hudson Bay', () => {
    const lakes = waterBodies().filter((body) => !body.some((p) => OCEAN.has(key(p))));
    const great = lakes.find((body) => body.every(([x, y]) => x >= 19 && x <= 27 && y >= 9 && y <= 13));
    expect(great).toBeDefined();
    const lake = great as [number, number][];
    expect(lake.length).toBeGreaterThanOrEqual(4);
    expect(lake.length).toBeLessThanOrEqual(12);
    const inLake = new Set(lake.map(key));
    const atlantic = (p: readonly [number, number]): boolean => p[0] >= 29 && p[1] >= 5 && p[1] <= 12 && OCEAN.has(key(p));
    expect(runs('major').some((run) =>
      run.some((p) => side(p).some((n) => inLake.has(key(n)))) && run.some((p) => side(p).some(atlantic)))).toBe(true);
    expect(SQUARES.some(([x, y]) => x >= 20 && x <= 25 && y >= 2 && y <= 6 && OCEAN.has(key([x, y])))).toBe(true);
    expect(worldStats(map).landlocked).toBe(0);
  });

  it('runs the Amazon from the Andes to the Atlantic and the Parana to the Plate', () => {
    const atlantic = (p: readonly [number, number]): boolean => p[0] >= 43 && p[1] >= 38 && p[1] <= 42 && OCEAN.has(key(p));
    expect(runs('major').some((run) => run.some((p) => p[0] <= 32) && run.some((p) => side(p).some(atlantic)))).toBe(true);
    const plate = (p: readonly [number, number]): boolean => p[0] >= 41 && p[0] <= 44 && p[1] >= 57 && p[1] <= 60 && OCEAN.has(key(p));
    expect(runs('major').some((run) => run.some((p) => side(p).some(plate)))).toBe(true);
  });

  it('keeps a Sea Lane on the west from row 30 and on the east on every row', () => {
    const has = (y: number, x0: number, x1: number): boolean => {
      for (let x = x0; x <= x1; x++) if (square([x, y]).base === 'seaLane') return true;
      return false;
    };
    for (let y = 30; y <= 68; y++) expect(has(y, 0, MAPGEN.westSeaColumns - 1), `west ${y}`).toBe(true);
    for (let y = 1; y <= 68; y++) expect(has(y, COLUMNS - MAPGEN.eastSeaColumns, COLUMNS - 1), `east ${y}`).toBe(true);
  });

  it('puts every listed site on settlement ground, none touching another, with mountains by the cities', () => {
    const sites = AMERICA_TRIBES.flatMap((tribe) => AMERICA_TRIBE_SITES[tribe].map((p) => ({ tribe, p })));
    for (const { tribe, p } of sites) expect(isSettlementGround(at(map, toGrid(p))), `${tribe} ${key(p)}`).toBe(true);
    for (const a of sites) {
      for (const b of sites) if (a !== b) expect(chebyshev(a.p, b.p), `${key(a.p)} ${key(b.p)}`).toBeGreaterThanOrEqual(2);
    }
    const mountainsNear = (p: readonly [number, number]): number =>
      SQUARES.filter((q) => chebyshev(p, q) <= 2 && square(q).relief === 'mountains').length;
    expect(Math.max(...AMERICA_TRIBE_SITES.inca.map(mountainsNear))).toBeGreaterThanOrEqual(3);
    expect(Math.max(...AMERICA_TRIBE_SITES.aztec.map(mountainsNear))).toBeGreaterThanOrEqual(3);
  });

  it('runs the Andes down the whole Pacific coast of South America', () => {
    for (let y = 36; y <= 66; y++) {
      const west = Math.min(...SOLID.filter((p) => p[1] === y).map((p) => p[0]));
      const ok = [0, 1, 2].some((dx) => inside([west + dx, y]) && square([west + dx, y]).relief === 'mountains');
      expect(ok, `row ${y}, coast at ${west}`).toBe(true);
    }
  });

  it('holds seven silver deposits along the Andes', () => {
    const silver = SQUARES.filter((p) => square(p).resource === 'silverDeposit');
    const andes: [number, number][] = [[26, 41], [29, 45], [30, 49], [31, 51], [30, 53], [30, 55], [30, 58]];
    const byRow = (a: readonly [number, number], b: readonly [number, number]): number => a[1] - b[1] || a[0] - b[0];
    expect(silver.filter((p) => p[1] >= 35).sort(byRow)).toEqual(andes);
    expect([...silver].sort(byRow)).toEqual([[9, 23], [14, 23], ...andes]);
    for (const p of silver) expect(square(p).relief, key(p)).toBe('mountains');
    for (const a of silver) for (const b of silver) if (a !== b) expect(chebyshev(a, b), `${key(a)} ${key(b)}`).toBeGreaterThanOrEqual(2);
    // The colony squares the deposits were laid out for: hills, clear of every settlement site, silver in reach.
    const sites = AMERICA_TRIBES.flatMap((tribe): (readonly [number, number])[] => [...AMERICA_TRIBE_SITES[tribe]]);
    const colonies: [[number, number], number][] = [[[30, 46], 1], [[31, 50], 2], [[31, 52], 2], [[31, 54], 2]];
    for (const [p, reach] of colonies) {
      const t = square(p);
      expect([solid(t), t.relief], key(p)).toEqual([true, 'hills']);
      expect(Math.min(...sites.map((s) => chebyshev(p, s))), key(p)).toBeGreaterThanOrEqual(2);
      expect(silver.filter((s) => chebyshev(p, s) === 1).length, key(p)).toBeGreaterThanOrEqual(reach);
    }
    expect(square([30, 45]).resource).toBe('oreDeposit');
  });

  it('keeps the densities of resources, rumors, relief and forest near the generator', () => {
    const land = SOLID.map(square);
    const resources = land.filter((t) => t.resource !== null).length;
    expect(resources / land.length).toBeGreaterThanOrEqual(0.05);
    expect(resources / land.length).toBeLessThanOrEqual(0.09);
    const nearWater = SQUARES.filter((p) => isWater(square(p)) && toSolid(p) <= 2);
    const fisheries = nearWater.filter((p) => square(p).resource === 'fishery').length;
    expect(fisheries / nearWater.length).toBeGreaterThanOrEqual(0.02);
    expect(fisheries / nearWater.length).toBeLessThanOrEqual(0.05);
    const rumors = SQUARES.filter((p) => square(p).rumor).length;
    expect(rumors).toBeGreaterThanOrEqual(20);
    expect(rumors).toBeLessThanOrEqual(25);
    const share = (pred: (t: Tile) => boolean): number => land.filter(pred).length / land.length;
    expect(share((t) => t.relief === 'mountains')).toBeGreaterThanOrEqual(0.03);
    expect(share((t) => t.relief === 'mountains')).toBeLessThanOrEqual(0.06);
    expect(share((t) => t.relief === 'hills')).toBeGreaterThanOrEqual(0.06);
    expect(share((t) => t.relief === 'hills')).toBeLessThanOrEqual(0.12);
    const flat = land.filter((t) => t.relief === 'flat');
    const wooded = flat.filter((t) => t.forest).length / flat.length;
    expect(wooded).toBeGreaterThanOrEqual(0.5);
    expect(wooded).toBeLessThanOrEqual(0.7);
  });
});
