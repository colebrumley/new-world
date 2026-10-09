// Tile production (R-101). Written from docs/RULES.md "Tile yield"; the order of the steps
// matters and follows that note exactly.
import { RESOURCE_BONUS, type ResourceBonus } from './data/resources';
import { TERRAIN, type RawGood } from './data/terrain';
import { CENTER_TILE, DEPLETION, DIFFICULTIES, YIELD_RULES, type Difficulty } from './data/yields';
import type { Rng } from './rng';
import { tileAt, type GameMap } from './state';
import { isWater, terrainOf, type Tile } from './tile';

export interface OutdoorWorker {
  /** The raw good this colonist is an expert at, if any. */
  readonly expertGood: RawGood | null;
  readonly convert: boolean;
}

export const FREE_COLONIST: OutdoorWorker = { expertGood: null, convert: false };

export interface YieldContext {
  /** How many of the 8 neighbours are Ocean or Sea Lane (off-map counts as not water). Fish only. */
  readonly waterNeighbors: number;
  /** 0, 1 (colony reached 50% Sons of Liberty) or 2 (reached 100%). */
  readonly solBonus: number;
  /** Tory penalty of the colony, already divided for difficulty; 0 for AI colonies. */
  readonly toryPenalty: number;
  readonly hasDocks: boolean;
  readonly hasHudson: boolean;
}

export const NEUTRAL_CONTEXT: YieldContext = { waterNeighbors: 0, solBonus: 0, toryPenalty: 0, hasDocks: true, hasHudson: false };

const includes = (list: readonly RawGood[], good: RawGood): boolean => list.includes(good);

function resourceBonus(tile: Tile, good: RawGood): ResourceBonus | null {
  if (!tile.resource) return null;
  const table: Partial<Record<RawGood, ResourceBonus>> = RESOURCE_BONUS[tile.resource];
  return table[good] ?? null;
}

export function countWaterNeighbors(map: GameMap, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const t = tileAt(map, x + dx, y + dy);
      if (t && isWater(t)) n++;
    }
  }
  return n;
}

/** Goods per turn one colonist produces working this tile. */
export function tileYield(tile: Tile, good: RawGood, worker: OutdoorWorker = FREE_COLONIST, context: Partial<YieldContext> = {}): number {
  const ctx = { ...NEUTRAL_CONTEXT, ...context };
  const expert = worker.expertGood === good;
  const foodlike = good === 'food' || good === 'fish';
  const sol = ctx.solBonus - ctx.toryPenalty;

  let p: number = TERRAIN[terrainOf(tile)].yields[good];

  if (p > 0 && good === 'fish') {
    const rule = YIELD_RULES.fishByWaterNeighbors.find(([min]) => ctx.waterNeighbors >= min);
    p += rule ? rule[1] : 0;
  }
  if (p > 0 && good === 'furs') {
    if (tile.road) p += YIELD_RULES.fursRoadPre;
    if (tile.river === 'minor') p += YIELD_RULES.fursMinorRiverPre;
    if (tile.river === 'major') p += YIELD_RULES.fursMajorRiverPre;
  }
  p = Math.max(0, p);

  if (p > 0 && sol > 0) p += sol;

  if (expert && p > 0) {
    if (foodlike) p += YIELD_RULES.foodExpertAdd + Math.max(0, sol);
    else p *= YIELD_RULES.expertMultiplier;
  }

  const bonus = resourceBonus(tile, good);
  if (bonus && !(tile.resource === 'fishery' && p < 1)) {
    if (bonus.kind === 'double') p *= 2;
    else p += expert ? bonus.n * 2 : bonus.n;
  }

  // Silver needs a deposit (or a worked-out one) for the ordinary bonuses to count.
  const bareSilver = good === 'silver' && tile.resource === null;
  if (bareSilver && p > 0) p = tile.road || expert ? YIELD_RULES.bareSilver : 0;

  if (good === 'lumber') p *= 2;

  if (p > 0 && !bareSilver) {
    const unit = (expert && !foodlike) || good === 'lumber' ? 2 : 1;
    let add = 0;
    if (good === 'food') add += unit;
    if (tile.road && includes(YIELD_RULES.roadGoods, good)) add += unit;
    if (tile.plowed && includes(YIELD_RULES.plowGoods, good)) add += unit;
    if (tile.river !== 'none') add += unit;
    // a major river is worth a second step only when nothing else has been added
    if (tile.river === 'major' && add === unit) add += unit;
    p += add;
  }

  if (good === 'fish' && !ctx.hasDocks) p = 0;
  if (good === 'furs' && ctx.hasHudson) p *= YIELD_RULES.hudsonFursMultiplier;
  if (worker.convert && p > 0 && includes(YIELD_RULES.convertGoods, good)) p += YIELD_RULES.convertBonus;

  p = Math.max(0, p);
  if (p > 0 && sol < 0) p = Math.max(0, p + sol);
  return p;
}

export interface CenterYield {
  readonly food: number;
  readonly secondary: { readonly good: RawGood; readonly amount: number } | null;
}

/** What the square a colony stands on produces by itself. Road, experts and Tories play no part. */
export function colonyCenterYield(tile: Tile, difficulty: Difficulty, solBonus = 0): CenterYield {
  const terrain = terrainOf(tile);
  const foodTable: Partial<Record<string, number>> = CENTER_TILE.food;
  let food = foodTable[terrain] ?? CENTER_TILE.foodDefault;
  food += CENTER_TILE.foodByDifficulty[difficulty];
  if (tile.plowed) food += CENTER_TILE.plowFood;
  if (tile.resource && (CENTER_TILE.foodResources as readonly string[]).includes(tile.resource)) food += CENTER_TILE.resourceFood;
  food += solBonus;

  let best: { good: RawGood; amount: number } | null = null;
  for (const good of CENTER_TILE.secondaryGoods) {
    let amount: number = TERRAIN[terrain].yields[good];
    const bonus = resourceBonus(tile, good);
    if (bonus) amount = bonus.kind === 'double' ? amount * 2 : amount + bonus.n;
    if (amount > (best?.amount ?? 0)) best = { good, amount };
  }
  if (best) {
    best.amount += CENTER_TILE.secondaryByDifficulty[difficulty] + solBonus;
    if (tile.river === 'minor') best.amount += CENTER_TILE.minorRiver;
    if (tile.river === 'major') best.amount += CENTER_TILE.majorRiver;
  }
  return { food, secondary: best };
}

// --- depletion --------------------------------------------------------------------------

/** How hard working this tile for this good wears on the colony's deposits. */
export function depletionWeight(tile: Tile, good: RawGood): number {
  if (tile.resource === 'minerals' && good === 'ore') return DEPLETION.weight.mineralsOre;
  if (tile.resource === 'minerals' && good === 'silver') return DEPLETION.weight.mineralsSilver;
  if (tile.resource === 'silverDeposit' && good === 'silver') return DEPLETION.weight.silverDepositSilver;
  return 0;
}

/**
 * Advance a colony's depletion counter by one turn of mining with total `weight`.
 * Returns the new counter and whether the worked deposits run out this turn.
 */
export function tickDepletion(counter: number, weight: number, difficulty: Difficulty, rng: Rng): { counter: number; depleted: boolean } {
  const d = DIFFICULTIES.indexOf(difficulty);
  let next = counter;
  for (let i = 0; i < weight; i++) if (rng.chance((d + 1) / (d + 2))) next++;
  return next >= DEPLETION.threshold ? { counter: next - DEPLETION.threshold, depleted: true } : { counter: next, depleted: false };
}

/** A Silver Deposit becomes a Depleted Mine; Minerals vanish; anything else is untouched. */
export function depleteTile(tile: Tile): Tile {
  if (tile.resource === 'silverDeposit') return { ...tile, resource: 'depletedMine' };
  if (tile.resource === 'minerals') return { ...tile, resource: null };
  return tile;
}

