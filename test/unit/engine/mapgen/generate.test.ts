import { describe, expect, it } from 'vitest';
import {
  CLIMATE_OPTIONS, DEFAULT_WORLD, LAND_FORM_OPTIONS, LAND_MASS_OPTIONS, MAP_HEIGHT, MAP_WIDTH, MAPGEN, TEMPERATURE_OPTIONS,
  type WorldOptions,
} from '../../../../src/engine/data/mapgen';
import { RESOURCE_TERRAINS } from '../../../../src/engine/data/resources';
import { generateWorld, isPlayable, worldStats } from '../../../../src/engine/mapgen/generate';
import { createRng } from '../../../../src/engine/rng';
import type { GameMap } from '../../../../src/engine/state';
import { isWater, terrainOf, type Tile } from '../../../../src/engine/tile';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const world = (seed: number, options: Partial<WorldOptions> = {}): GameMap => generateWorld(createRng(seed).fork('world'), { ...DEFAULT_WORLD, ...options });
const tileAtXY = (map: GameMap, x: number, y: number): Tile => map.tiles[y * map.width + x] as Tile;

// The option matrix is cycled across the 50 seeds so every value of every option is exercised.
const optionsFor = (seed: number): WorldOptions => ({
  landMass: LAND_MASS_OPTIONS[seed % 3]!,
  landForm: LAND_FORM_OPTIONS[Math.floor(seed / 3) % 3]!,
  temperature: TEMPERATURE_OPTIONS[Math.floor(seed / 9) % 3]!,
  climate: CLIMATE_OPTIONS[Math.floor(seed / 27) % 3]!,
});

describe('generateWorld', () => {
  it('is 58x72 with a water border and is deterministic per seed', () => {
    const a = world(1);
    expect([a.width, a.height, a.tiles.length]).toEqual([MAP_WIDTH, MAP_HEIGHT, MAP_WIDTH * MAP_HEIGHT]);
    expect(world(1)).toEqual(a);
    expect(world(2)).not.toEqual(a);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (!isPlayable(x, y)) expect(isWater(tileAtXY(a, x, y)), `${x},${y}`).toBe(true);
      }
    }
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it.each(SEEDS)('seed %i: land ratio, land masses, coast access, rumors', (seed) => {
    const options = optionsFor(seed);
    const stats = worldStats(world(seed, options));
    const want = MAPGEN.landRatio[options.landMass];
    expect(stats.landRatio).toBeGreaterThan(want - MAPGEN.landRatioTolerance);
    expect(stats.landRatio).toBeLessThan(want + MAPGEN.landRatioTolerance);
    expect(stats.landMasses).toBeLessThanOrEqual(MAPGEN.maxLandMasses);
    expect(stats.landlocked).toBe(0);
    expect(stats.rumors).toBeGreaterThanOrEqual(10);
    expect(stats.rumors).toBeLessThanOrEqual(25);
  });

  it.each(SEEDS)('seed %i: rivers, resources, rumors, sea lanes and poles obey their rules', (seed) => {
    const map = world(seed, optionsFor(seed));
    let laneWest = 0;
    let laneEast = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = tileAtXY(map, x, y);
        const where = `${x},${y}`;
        if (t.river !== 'none') {
          expect(isWater(t), where).toBe(false);
          const linked = [[0, -1], [-1, 0], [1, 0], [0, 1]].some(([dx, dy]) => tileAtXY(map, x + dx!, y + dy!).river !== 'none');
          expect(linked, `river at ${where} is a single tile`).toBe(true);
        }
        if (t.resource) expect(RESOURCE_TERRAINS[t.resource], `${t.resource} at ${where}`).toContain(terrainOf(t));
        if (t.rumor) {
          expect(isWater(t), where).toBe(false);
          expect(t.base, where).not.toBe('arctic');
        }
        if (t.forest) expect(['flat'], where).toContain(t.relief);
        if (t.base === 'seaLane') {
          if (x < MAP_WIDTH / 2) laneWest++;
          else laneEast++;
        }
        if (isWater(t)) expect([t.forest, t.river, t.relief, t.rumor], where).toEqual([false, 'none', 'flat', false]);
      }
    }
    expect(laneWest).toBeGreaterThan(MAP_HEIGHT);
    expect(laneEast).toBeGreaterThan(MAP_HEIGHT * 3);
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      expect(tileAtXY(map, x, 1).base).toBe('arctic');
      expect(tileAtXY(map, x, MAP_HEIGHT - 2).base).toBe('arctic');
    }
  });

  it('starts with about 60% of flat land forested in a normal climate', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { forestRatio } = worldStats(world(seed));
      expect(forestRatio).toBeGreaterThan(0.55);
      expect(forestRatio).toBeLessThan(0.65);
    }
  });

  it('responds to each customize option in the expected direction', () => {
    const avg = (options: Partial<WorldOptions>, measure: (m: GameMap) => number): number =>
      SEEDS.slice(0, 12).reduce((sum, seed) => sum + measure(world(seed, options)), 0) / 12;
    const count = (pred: (t: Tile) => boolean) => (m: GameMap): number => m.tiles.filter(pred).length;

    const land = (m: GameMap): number => worldStats(m).landTiles;
    expect(avg({ landMass: 'small' }, land)).toBeLessThan(avg({ landMass: 'normal' }, land));
    expect(avg({ landMass: 'normal' }, land)).toBeLessThan(avg({ landMass: 'large' }, land));

    const masses = (m: GameMap): number => worldStats(m).landMasses;
    expect(avg({ landForm: 'archipelago' }, masses)).toBeGreaterThan(avg({ landForm: 'continents' }, masses));

    const cold = count((t) => t.base === 'tundra');
    expect(avg({ temperature: 'cool' }, cold)).toBeGreaterThan(avg({ temperature: 'warm' }, cold));

    const dry = count((t) => t.base === 'desert' || t.base === 'prairie');
    const wooded = count((t) => t.forest);
    expect(avg({ climate: 'arid' }, dry)).toBeGreaterThan(avg({ climate: 'wet' }, dry));
    expect(avg({ climate: 'arid' }, wooded)).toBeLessThan(avg({ climate: 'wet' }, wooded));
  });

  it('uses every land terrain, hills, mountains and both river sizes somewhere across seeds', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS.slice(0, 15)) {
      for (const t of world(seed).tiles) {
        seen.add(terrainOf(t));
        if (t.river !== 'none') seen.add(`river:${t.river}`);
        if (t.resource) seen.add(`res:${t.resource}`);
      }
    }
    for (const want of [
      'tundra', 'desert', 'plains', 'prairie', 'grassland', 'savannah', 'marsh', 'swamp',
      'boreal', 'scrub', 'mixed', 'broadleaf', 'conifer', 'tropical', 'wetland', 'rain',
      'arctic', 'ocean', 'seaLane', 'hills', 'mountains', 'river:minor', 'river:major',
    ]) {
      expect(seen, want).toContain(want);
    }
    expect([...seen].filter((s) => s.startsWith('res:')).length).toBeGreaterThanOrEqual(10);
  });
});

describe('createGame with a generated world', () => {
  it('uses the generator and starts each power at sea with a soldier and a pioneer aboard a caravel', async () => {
    const { createGame } = await import('../../../../src/engine/game');
    const { checkInvariants } = await import('../../../../src/engine/invariants');
    const players = [{ id: 'a', name: 'A', kind: 'human' }, { id: 'b', name: 'B', kind: 'ai' }] as const;
    const state = createGame({ seed: 12, world: DEFAULT_WORLD, players });
    expect(state.map.width).toBe(MAP_WIDTH);
    const bare = (m: GameMap): Tile[] => m.tiles.map((t) => ({ ...t, explored: 0 }));
    expect(bare(state.map)).toEqual(bare(createGame({ seed: 12, world: DEFAULT_WORLD }).map));
    expect(checkInvariants(state)).toEqual([]);
    for (const p of players) {
      const mine = Object.values(state.units).filter((u) => u.owner === p.id);
      expect(mine.map((u) => u.type)).toEqual(['caravel', 'soldier', 'pioneer']);
      const ship = mine[0]!;
      expect(tileAtXY(state.map, ship.x, ship.y).base).toBe('seaLane');
      expect(mine.slice(1).every((u) => u.aboard === ship.id && u.x === ship.x && u.y === ship.y)).toBe(true);
      expect(ship.movesLeft).toBe(12);
    }
    const ys = Object.values(state.units).filter((u) => u.type === 'caravel').map((u) => u.y);
    expect(ys[0]).not.toBe(ys[1]);
  });
});
