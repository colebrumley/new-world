// Placing the native settlements on a new map (R-501). The America map uses the listed sites
// with a little scatter; a random map gets eight well-separated capitals and then settlements
// spreading out from them cell by cell.
import { AMERICA_TRIBE_SITES } from '../data/america';
import { SETTLEMENT_PLACEMENT as P, SETTLEMENT_TERRAIN, WESTERN_TRIBES } from '../data/settlements';
import { MAX_SETTLEMENTS, settlementPopulation, TRIBE_IDS, type TribeId } from '../data/tribes';
import type { Rng } from '../rng';
import { nativeDistance } from '../settlements';
import type { GameMap, Settlement } from '../state';
import { isWater, type Tile } from '../tile';

type Site = { x: number; y: number; tribe: TribeId; capital: boolean };

const tileOf = (map: GameMap, x: number, y: number): Tile | undefined =>
  x > 0 && y > 0 && x < map.width - 1 && y < map.height - 1 ? map.tiles[y * map.width + x] : undefined;

/** Level ground of a kind natives settle on. */
export function isSettlementGround(tile: Tile | undefined): boolean {
  return tile !== undefined && !isWater(tile) && tile.relief === 'flat' && (SETTLEMENT_TERRAIN as readonly string[]).includes(tile.base);
}

const nearest = (sites: readonly Site[], x: number, y: number): { site: Site | null; d: number } => {
  let site: Site | null = null;
  let d = Infinity;
  for (const s of sites) {
    const here = Math.max(Math.abs(s.x - x), Math.abs(s.y - y));
    if (here < d) {
      site = s;
      d = here;
    }
  }
  return { site, d };
};

function toSettlements(sites: readonly Site[]): Settlement[] {
  return sites.slice(0, MAX_SETTLEMENTS).map((s, i) => ({
    id: `s${i + 1}`, tribe: s.tribe, x: s.x, y: s.y, capital: s.capital,
    population: settlementPopulation(s.tribe, s.capital).start,
    growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
  }));
}

/** America: every listed site, shifted a little; the first of each tribe is its capital. Coordinates in the list are playable ones. */
export function placeAmericaSettlements(map: GameMap, rng: Rng): Settlement[] {
  const sites: Site[] = [];
  for (const tribe of TRIBE_IDS) {
    AMERICA_TRIBE_SITES[tribe].forEach(([px, py], index) => {
      for (let attempt = 0; attempt < P.siteTries; attempt++) {
        const x = px + 1 + rng.int(-1, 1) + rng.int(-1, 1);
        const y = py + 1 + rng.int(-1, 1) + rng.int(-1, 1);
        const apart = (P.siteSpacing.find((s) => attempt < s.untilTry) ?? P.siteSpacing[P.siteSpacing.length - 1]!).apart;
        if (!isSettlementGround(tileOf(map, x, y)) || nearest(sites, x, y).d <= apart) continue;
        sites.push({ x, y, tribe, capital: index === 0 });
        break;
      }
    });
  }
  return toSettlements(sites);
}

/** A random map: capitals first, far apart, then the rest spreading from them one cell at a time. */
export function placeRandomSettlements(map: GameMap, rng: Rng): Settlement[] {
  const cols = Math.ceil(map.width / P.cell);
  const rows = Math.ceil(map.height / P.cell);
  const taken = new Set<number>();
  const cellOf = (x: number, y: number): number => Math.floor(y / P.cell) * cols + Math.floor(x / P.cell);
  const sites: Site[] = [];
  const capitals = new Map<TribeId, Site>();

  for (const tribe of TRIBE_IDS) {
    const west = (WESTERN_TRIBES as readonly TribeId[]).includes(tribe);
    for (let attempt = 0; attempt < P.capitalTries; attempt++) {
      const x = rng.int(P.capitalMargin[0], map.width - P.capitalMargin[0]);
      const y = rng.int(P.capitalMargin[1], map.height - P.capitalMargin[1]);
      const tile = tileOf(map, x, y);
      if (!tile || isWater(tile) || tile.relief !== 'flat' || tile.base === 'arctic' || taken.has(cellOf(x, y))) continue;
      if (west && x > Math.max(P.capitalMargin[0], Math.floor(attempt / P.westwardDivisor))) continue;
      const wanted = Math.max(P.capitalApartFloor, P.capitalApart - Math.floor(attempt / P.capitalEaseEvery));
      if (nearest(sites, x, y).d < wanted) continue;
      const site: Site = { x, y, tribe, capital: true };
      sites.push(site);
      capitals.set(tribe, site);
      taken.add(cellOf(x, y));
      break;
    }
  }
  const placed = TRIBE_IDS.filter((t) => capitals.has(t));
  if (placed.length === 0) return [];

  const STEPS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
  for (let attempt = 0; attempt < P.spreadTries && sites.length < MAX_SETTLEMENTS; attempt++) {
    const from = capitals.get(rng.pick(placed)) as Site;
    let cx = Math.floor(from.x / P.cell);
    let cy = Math.floor(from.y / P.cell);
    // wander from the capital's cell to the first empty one; give up on leaving the map
    while (cx >= 0 && cy >= 0 && cx < cols && cy < rows && taken.has(cy * cols + cx)) {
      const [dx, dy] = rng.pick(STEPS);
      cx += dx;
      cy += dy;
    }
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
    const mid = Math.floor(P.cell / 2);
    const open: [number, number][] = [];
    for (let dy = -P.cellCore; dy <= P.cellCore; dy++) {
      for (let dx = -P.cellCore; dx <= P.cellCore; dx++) {
        const x = cx * P.cell + mid + dx;
        const y = cy * P.cell + mid + dy;
        if (isSettlementGround(tileOf(map, x, y)) && nearest(sites, x, y).d > 1) open.push([x, y]);
      }
    }
    if (open.length === 0) continue;
    const [x, y] = rng.pick(open);
    // it belongs to whoever already lives nearest, not necessarily the tribe that set out
    let owner = from.tribe;
    let best = Infinity;
    for (const s of sites) {
      const d = nativeDistance(s.x, s.y, x, y);
      if (d < best) {
        best = d;
        owner = s.tribe;
      }
    }
    sites.push({ x, y, tribe: owner, capital: false });
    taken.add(cy * cols + cx);
  }
  return toSettlements(sites);
}
