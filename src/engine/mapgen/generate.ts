// Random "New World" generator (R-102). Deterministic for a given Rng and options.
import { DEFAULT_WORLD, MAP_HEIGHT, MAP_WIDTH, MAPGEN, type WorldOptions } from '../data/mapgen';
import { RESOURCE_TERRAINS, type ResourceId } from '../data/resources';
import type { OpenTerrain } from '../data/terrain';
import type { Rng } from '../rng';
import type { GameMap } from '../state';
import { isWater, makeTile, terrainOf, type BaseTerrain, type Relief, type River, type Tile } from '../tile';
import { fractalNoise } from './noise';

const W = MAP_WIDTH;
const H = MAP_HEIGHT;
const N = W * H;

const N4: readonly (readonly [number, number])[] = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const N8: readonly (readonly [number, number])[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const at = (x: number, y: number): number => y * W + x;
const onGrid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;

/** Inside the 1-tile border. */
export function isPlayable(x: number, y: number): boolean {
  return x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
}

function neighbors(i: number, dirs: readonly (readonly [number, number])[]): number[] {
  const x = i % W;
  const y = (i - x) / W;
  const out: number[] = [];
  for (const [dx, dy] of dirs) if (onGrid(x + dx, y + dy)) out.push(at(x + dx, y + dy));
  return out;
}

/** Label connected components of the tiles where `member` holds. Returns label per tile (-1 = none) and sizes. */
function components(member: (i: number) => boolean, dirs: readonly (readonly [number, number])[]): { label: number[]; sizes: number[] } {
  const label = new Array<number>(N).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < N; start++) {
    if (label[start] !== -1 || !member(start)) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      size++;
      for (const n of neighbors(i, dirs)) {
        if (label[n] === -1 && member(n)) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/** Breadth-first distance (in `dirs` steps) from the nearest tile where `source` holds. */
function distanceFrom(source: (i: number) => boolean, dirs: readonly (readonly [number, number])[]): number[] {
  const dist = new Array<number>(N).fill(Infinity);
  let frontier: number[] = [];
  for (let i = 0; i < N; i++) {
    if (source(i)) {
      dist[i] = 0;
      frontier.push(i);
    }
  }
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const i of frontier) {
      for (const n of neighbors(i, dirs)) {
        if (dist[n] === Infinity) {
          dist[n] = (dist[i] as number) + 1;
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

// --- land shape -------------------------------------------------------------------------

function shapeLand(rng: Rng, options: WorldOptions): boolean[] {
  const xMin = 1 + MAPGEN.westLaneColumns + MAPGEN.laneLandGap;
  const xMax = W - 2 - MAPGEN.eastLaneColumns - MAPGEN.laneLandGap;
  const yMin = 3;
  const yMax = H - 4;
  const eligible = (i: number): boolean => {
    const x = i % W;
    const y = (i - x) / W;
    return x >= xMin && x <= xMax && y >= yMin && y <= yMax;
  };

  const noise = fractalNoise(rng, W, H, MAPGEN.landFormCell[options.landForm], 4);
  const elevation = new Array<number>(N).fill(-1);
  const order: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!eligible(i)) continue;
    const x = i % W;
    const y = (i - x) / W;
    const edge = Math.min(x - xMin, xMax - x, y - yMin, yMax - y);
    elevation[i] = noise(x, y) * (0.55 + 0.45 * Math.min(1, edge / 5));
    order.push(i);
  }
  order.sort((a, b) => (elevation[b] as number) - (elevation[a] as number) || a - b);

  const target = Math.round(MAPGEN.landRatio[options.landMass] * (W - 2) * (H - 2));

  // Filling inland seas adds land, so aim lower and retry when the result overshoots.
  let aim = target;
  let land = raiseLand(aim, order);
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = land.filter(Boolean).length;
    if (count <= target * 1.06) break;
    aim = Math.max(1, aim - (count - target));
    land = raiseLand(aim, order);
  }
  return land;
}

/** Raise the `target` highest tiles, trim to the largest masses, regrow to `target`, fill inland seas. */
function raiseLand(target: number, order: readonly number[]): boolean[] {
  const land = new Array<boolean>(N).fill(false);
  for (const i of order.slice(0, target)) land[i] = true;

  const { label, sizes } = components((i) => land[i] === true, N8);
  const keep = new Set(
    sizes.map((size, id) => ({ size, id })).sort((a, b) => b.size - a.size || a.id - b.id).slice(0, MAPGEN.maxNonPolarMasses).map((m) => m.id),
  );
  let count = 0;
  for (let i = 0; i < N; i++) {
    if (land[i] && !keep.has(label[i] as number)) land[i] = false;
    if (land[i]) count++;
  }
  while (count < target) {
    let best = -1;
    for (const i of order) {
      if (land[i]) continue;
      if (neighbors(i, N4).some((n) => land[n])) {
        best = i;
        break; // `order` is by descending elevation, so the first shore tile is the highest
      }
    }
    if (best === -1) break;
    land[best] = true;
    count++;
  }

  const water = components((i) => !land[i], N8);
  const mainOcean = water.label[0];
  for (let i = 0; i < N; i++) {
    const id = water.label[i] as number;
    if (id !== -1 && id !== mainOcean && (water.sizes[id] as number) > MAPGEN.maxLakeTiles) land[i] = true;
  }
  return land;
}

// --- climate ----------------------------------------------------------------------------

function pickBase(warmth: number, moisture: number): OpenTerrain {
  if (warmth < 0.2) return moisture > 0.72 ? 'marsh' : 'tundra';
  if (warmth < 0.6) {
    if (moisture < 0.1) return 'desert';
    if (moisture < 0.36) return 'prairie';
    if (moisture < 0.62) return 'plains';
    if (moisture < 0.86) return 'grassland';
    return 'marsh';
  }
  if (moisture < 0.24) return 'desert';
  if (moisture < 0.4) return 'prairie';
  if (moisture < 0.54) return 'grassland';
  if (moisture < 0.8) return 'savannah';
  return 'swamp';
}

// --- the generator ----------------------------------------------------------------------

export function generateWorld(rng: Rng, options: WorldOptions = DEFAULT_WORLD): GameMap {
  return detailWorld(rng, shapeLand(rng.fork('land'), options), options);
}

/** Regional steering for a hand-shaped map (the America scenario). */
export interface WorldHints {
  /** Row of the equator; the default is the middle of the map. */
  readonly equatorY?: number;
  /** Added to the 0..1 moisture of a tile. */
  readonly moisture?: (x: number, y: number) => number;
  /** Added to a tile's forest score (roughly 0..1.25); negative clears, positive plants. */
  readonly forest?: (x: number, y: number) => number;
  /** Forces hills or mountains on a land tile; null leaves it to chance. */
  readonly relief?: (x: number, y: number) => Relief | null;
}

/** Turn a land mask (row-major, MAP_WIDTH x MAP_HEIGHT) into a full map. */
export function detailWorld(rng: Rng, land: readonly boolean[], options: WorldOptions = DEFAULT_WORLD, hints: WorldHints = {}): GameMap {

  // Polar caps: a full row of ice at each end, ragged on the inside.
  const polar = rng.fork('polar');
  const arctic = new Array<boolean>(N).fill(false);
  for (let x = 1; x < W - 1; x++) {
    arctic[at(x, 1)] = true;
    arctic[at(x, H - 2)] = true;
    if (polar.chance(0.35)) arctic[at(x, 2)] = true;
    if (polar.chance(0.35)) arctic[at(x, H - 3)] = true;
  }
  const isLandAt = (i: number): boolean => land[i] === true || arctic[i] === true;

  const climate = rng.fork('climate');
  const warmNoise = fractalNoise(climate, W, H, 9, 2);
  const wetNoise = fractalNoise(climate, W, H, 8, 3);
  const forestNoise = fractalNoise(climate, W, H, 5, 3);
  const mid = hints.equatorY ?? (H - 1) / 2;
  const span = Math.max(mid, H - 1 - mid);

  const base = new Array<BaseTerrain>(N).fill('ocean');
  const moistureAt = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    if (!isLandAt(i)) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (arctic[i]) {
      base[i] = 'arctic';
      continue;
    }
    const latitude = Math.abs(y - mid) / span; // 0 at the equator, 1 at the far pole
    const warmth = 1 - latitude + (warmNoise(x, y) - 0.5) * 0.25 + MAPGEN.temperatureShift[options.temperature];
    // stretch the noise so the dry and wet ends of the scale are actually reached
    const moisture = 0.5 + (wetNoise(x, y) - 0.5) * 1.8 + MAPGEN.moistureShift[options.climate] + (hints.moisture?.(x, y) ?? 0);
    moistureAt[i] = moisture;
    base[i] = pickBase(warmth, moisture);
  }

  // Relief: a few ridges of mountains with hills beside them, plus scattered hills.
  const reliefRng = rng.fork('relief');
  const relief = new Array<Relief>(N).fill('flat');
  const solid = (i: number): boolean => land[i] === true && !arctic[i];
  const landTiles: number[] = [];
  for (let i = 0; i < N; i++) if (solid(i)) landTiles.push(i);
  const mountainTarget = Math.round(landTiles.length * MAPGEN.mountainRatio);
  const hillTarget = Math.round(landTiles.length * MAPGEN.hillRatio);
  let mountains = 0;
  let hills = 0;
  if (hints.relief) {
    for (const i of landTiles) {
      const forced = hints.relief(i % W, Math.floor(i / W));
      if (!forced || forced === 'flat') continue;
      relief[i] = forced;
      if (forced === 'mountains') mountains++;
      else hills++;
    }
  }
  for (let guard = 0; mountains < mountainTarget && guard < 400 && landTiles.length > 0; guard++) {
    let i = reliefRng.pick(landTiles);
    let dir = reliefRng.pick(N8);
    const length = reliefRng.int(3, 9);
    for (let step = 0; step < length && mountains < mountainTarget; step++) {
      if (relief[i] !== 'mountains') {
        if (relief[i] === 'hills') hills--;
        relief[i] = 'mountains';
        mountains++;
      }
      for (const n of neighbors(i, N8)) {
        if (solid(n) && relief[n] === 'flat' && hills < hillTarget && reliefRng.chance(0.3)) {
          relief[n] = 'hills';
          hills++;
        }
      }
      if (reliefRng.chance(0.3)) dir = reliefRng.pick(N8);
      const x = (i % W) + dir[0];
      const y = Math.floor(i / W) + dir[1];
      if (!onGrid(x, y) || !solid(at(x, y))) break;
      i = at(x, y);
    }
  }
  for (const i of shuffled(reliefRng, landTiles)) {
    if (hills >= hillTarget) break;
    if (relief[i] === 'flat') {
      relief[i] = 'hills';
      hills++;
    }
  }

  // Forest: rank flat land by a blend of patch noise and moisture; the top share is wooded.
  const forest = new Array<boolean>(N).fill(false);
  const woodable = landTiles.filter((i) => relief[i] === 'flat');
  const score = (i: number): number =>
    forestNoise(i % W, Math.floor(i / W)) + 0.25 * (moistureAt[i] as number) + (hints.forest?.(i % W, Math.floor(i / W)) ?? 0);
  const ranked = [...woodable].sort((a, b) => score(b) - score(a) || a - b);
  const forestShare = Math.min(0.9, Math.max(0.1, MAPGEN.forestRatio + MAPGEN.forestShift[options.climate]));
  for (const i of ranked.slice(0, Math.round(ranked.length * forestShare))) forest[i] = true;

  // Rivers: start inland and walk toward the nearest water, so each is at least two tiles long.
  const riverRng = rng.fork('rivers');
  const river = new Array<River>(N).fill('none');
  const toWater = distanceFrom((i) => !isLandAt(i), N4);
  const sources = shuffled(riverRng, landTiles.filter((i) => (toWater[i] as number) >= 2));
  const riverCount = Math.min(sources.length, Math.round(landTiles.length / MAPGEN.landPerRiver));
  for (const source of sources.slice(0, riverCount)) {
    if (river[source] !== 'none') continue;
    const kind: River = riverRng.chance(MAPGEN.majorRiverChance) ? 'major' : 'minor';
    let i = source;
    for (let guard = 0; guard < W + H; guard++) {
      river[i] = kind;
      if ((toWater[i] as number) <= 1) break;
      const here = toWater[i] as number;
      const options4 = neighbors(i, N4).filter((n) => solid(n));
      if (options4.some((n) => river[n] !== 'none' && n !== i) && i !== source) break; // joined another river
      const downhill = options4.filter((n) => (toWater[n] as number) < here && river[n] === 'none');
      const level = options4.filter((n) => (toWater[n] as number) === here && river[n] === 'none');
      const pool = level.length > 0 && riverRng.chance(0.2) ? level : downhill;
      if (pool.length === 0) break;
      i = riverRng.pick(pool);
    }
  }
  // A walk can stall after one tile next to nothing; drop any river tile left on its own.
  const riverParts = components((i) => river[i] !== 'none', N4);
  for (let i = 0; i < N; i++) {
    const id = riverParts.label[i] as number;
    if (id !== -1 && (riverParts.sizes[id] as number) < 2) river[i] = 'none';
  }

  // Sea Lanes down both edges, kept away from land.
  const toLand = distanceFrom((i) => land[i] === true, N8);
  for (let i = 0; i < N; i++) {
    if (isLandAt(i)) continue;
    const x = i % W;
    const lane = x <= MAPGEN.westLaneColumns || x >= W - 1 - MAPGEN.eastLaneColumns;
    if (lane && (toLand[i] as number) > MAPGEN.laneLandGap) base[i] = 'seaLane';
  }

  const tiles: Tile[] = [];
  for (let i = 0; i < N; i++) {
    tiles.push(
      isLandAt(i)
        ? makeTile({ base: base[i] as BaseTerrain, forest: forest[i] === true, relief: relief[i] as Relief, river: river[i] as River })
        : makeTile({ base: base[i] as BaseTerrain }),
    );
  }

  // Special resources, only where the terrain allows them.
  const resourceRng = rng.fork('resources');
  const legal = Object.entries(RESOURCE_TERRAINS) as [ResourceId, readonly string[]][];
  for (let i = 0; i < N; i++) {
    const tile = tiles[i] as Tile;
    if (!isPlayable(i % W, Math.floor(i / W)) || tile.base === 'arctic' || tile.base === 'seaLane') continue;
    const water = isWater(tile);
    if (water && (toLand[i] as number) > 2) continue;
    if (!resourceRng.chance(water ? MAPGEN.fisheryChance : MAPGEN.landResourceChance)) continue;
    const terrain = terrainOf(tile);
    const choices = legal.filter(([id, where]) => id !== 'depletedMine' && where.includes(terrain)).map(([id]) => id);
    if (choices.length > 0) tiles[i] = { ...tile, resource: resourceRng.pick(choices) };
  }

  // Lost City Rumors on plain land, spread out.
  const rumorRng = rng.fork('rumors');
  const wanted = Math.max(MAPGEN.rumorsMin, Math.min(MAPGEN.rumorsMax, Math.round(landTiles.length / MAPGEN.landPerRumor)));
  const placed: number[] = [];
  for (const i of shuffled(rumorRng, landTiles)) {
    if (placed.length >= wanted) break;
    const tile = tiles[i] as Tile;
    if (tile.relief === 'mountains' || tile.resource !== null) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    if (placed.some((p) => Math.max(Math.abs((p % W) - x), Math.abs(Math.floor(p / W) - y)) < 3)) continue;
    tiles[i] = { ...tile, rumor: true };
    placed.push(i);
  }

  return { width: W, height: H, tiles };
}

// --- analysis helpers shared by tests, the AI and game setup -------------------------------

export interface WorldStats {
  readonly landTiles: number;
  /** Non-arctic land as a share of the playable area. */
  readonly landRatio: number;
  readonly landMasses: number;
  readonly forestRatio: number;
  readonly rumors: number;
  /** Land tiles in masses that touch no water connected to the map edge. */
  readonly landlocked: number;
}

export function worldStats(map: GameMap): WorldStats {
  const tile = (i: number): Tile => map.tiles[i] as Tile;
  const solid = (i: number): boolean => !isWater(tile(i)) && tile(i).base !== 'arctic';
  let landTiles = 0;
  let forested = 0;
  let woodable = 0;
  let rumors = 0;
  for (let i = 0; i < N; i++) {
    const t = tile(i);
    if (t.rumor) rumors++;
    if (!solid(i)) continue;
    landTiles++;
    if (t.relief === 'flat') {
      woodable++;
      if (t.forest) forested++;
    }
  }
  const masses = components((i) => !isWater(tile(i)), N8);
  const water = components((i) => isWater(tile(i)), N8);
  const mainOcean = water.label[0];
  const coastal = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (water.label[i] !== mainOcean) continue;
    for (const n of neighbors(i, N8)) if (masses.label[n] !== -1) coastal.add(masses.label[n] as number);
  }
  let landlocked = 0;
  masses.sizes.forEach((size, id) => {
    if (!coastal.has(id)) landlocked += size;
  });
  return {
    landTiles,
    landRatio: landTiles / ((W - 2) * (H - 2)),
    landMasses: masses.sizes.length,
    forestRatio: woodable === 0 ? 0 : forested / woodable,
    rumors,
    landlocked,
  };
}
