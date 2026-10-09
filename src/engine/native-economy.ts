// What a settlement wants and what it has to offer (the basis of trade, tribute, gifts and the
// skill it teaches). Nothing here is stored: it is worked out afresh from the land in the 5 x 5
// block around the settlement, its size, and what the tribe has lately traded.
import { amountOf } from './cargo';
import { GOOD_IDS, type GoodId } from './data/goods';
import {
  CAPITAL_DEMAND_DOUBLE, CAPITAL_DEMAND_HALF_MORE, CAPITAL_SUPPLY_DOUBLE, CENSUS_COLD, CENSUS_CROPS, CENSUS_FOOD, CENSUS_HEAT, CENSUS_ORE,
  FUR_FORESTS, HEAT_OTHER_FOREST, NATIVE_ECONOMY as E,
} from './data/native-economy';
import { FORESTED_FROM } from './data/terrain';
import { TRIBES } from './data/tribes';
import { workerAt } from './jobs';
import type { GameState, Settlement } from './state';
import { isWater, type Tile } from './tile';

export interface LandCensus {
  food: number; sugar: number; tobacco: number; cotton: number; ore: number;
  hills: number; mountains: number; furRich: number; furPoor: number; cold: number; heat: number;
}
export type GoodTable = Record<GoodId, number>;

const table = (): GoodTable => Object.fromEntries(GOOD_IDS.map((g) => [g, 0])) as GoodTable;
const pick = (from: Readonly<Record<string, number>>, key: string): number => from[key] ?? 0;
const even = (n: number): number => n - (n % 2);

/** Tally the land around a settlement. Tiles a colony is working are left out. */
export function landCensus(state: GameState, settlement: Settlement): LandCensus {
  const tech = TRIBES[settlement.tribe].tech;
  const c: LandCensus = { food: 0, sugar: 0, tobacco: 0, cotton: 0, ore: 0, hills: 0, mountains: 0, furRich: 0, furPoor: 0, cold: 0, heat: 0 };
  const colonies = Object.values(state.colonies);
  let ocean = 0;
  for (let dy = -E.blockRadius; dy <= E.blockRadius; dy++) {
    for (let dx = -E.blockRadius; dx <= E.blockRadius; dx++) {
      const x = settlement.x + dx;
      const y = settlement.y + dy;
      const tile: Tile | undefined = x >= 0 && y >= 0 && x < state.map.width && y < state.map.height ? state.map.tiles[y * state.map.width + x] : undefined;
      if (!tile || colonies.some((col) => workerAt(col, x - col.x, y - col.y))) continue;
      if (isWater(tile)) {
        ocean += tech + 1;
        continue;
      }
      if (tile.relief === 'hills') c.hills++;
      else if (tile.relief === 'mountains') c.mountains++;
      else if (tile.base === 'arctic') c.cold += CENSUS_COLD.arctic;
      else if (tile.forest) {
        const kind = FORESTED_FROM[tile.base as keyof typeof FORESTED_FROM];
        c.food += E.forestFood;
        c.sugar += pick(CENSUS_CROPS.sugar.forest, kind);
        c.tobacco += pick(CENSUS_CROPS.tobacco.forest, kind);
        c.cotton += pick(CENSUS_CROPS.cotton.forest, kind);
        if ((FUR_FORESTS as readonly string[]).includes(kind)) c.furRich++;
        else c.furPoor++;
        c.cold += pick(CENSUS_COLD, kind);
        c.heat += kind in CENSUS_COLD ? 0 : HEAT_OTHER_FOREST;
      } else {
        c.food += pick(CENSUS_FOOD, tile.base);
        c.sugar += pick(CENSUS_CROPS.sugar.open, tile.base);
        c.tobacco += pick(CENSUS_CROPS.tobacco.open, tile.base);
        c.cotton += pick(CENSUS_CROPS.cotton.open, tile.base);
        c.ore += pick(CENSUS_ORE, tile.base);
        c.cold += pick(CENSUS_COLD, tile.base);
        c.heat += pick(CENSUS_HEAT, tile.base);
      }
    }
  }
  c.food += E.oceanFood * Math.floor(ocean / E.oceanPer);
  return c;
}

/** Demand and supply of a settlement for each of the sixteen goods. */
export function settlementEconomy(state: GameState, settlement: Settlement): { demand: GoodTable; supply: GoodTable } {
  const tribe = state.tribes[settlement.tribe];
  const t = TRIBES[settlement.tribe].tech;
  const P = settlement.population + 1;
  const dwellings = Math.max(1, Object.values(state.settlements).filter((s) => s.tribe === settlement.tribe).length);
  const c = landCensus(state, settlement);
  const U = table();
  const D = table();

  U.food = Math.trunc(((t + P) * c.food) / (7 - t));
  D.food = U.food > 0 ? 0 : (4 * P * P) >> (t >= 2 ? 1 : 0);
  if (t >= 2) U.silver = Math.trunc((tribe?.silver ?? 0) / dwellings) + c.mountains * (settlement.tribe === 'inca' ? E.silverPerMountainInca : E.silverPerMountain);
  if (t >= 1) U.ore = 2 * c.hills + c.mountains + c.ore;
  U.furs = Math.trunc((2 * c.furRich + (c.furPoor >> 1)) / (t + 1));
  U.coats = even(U.furs + t);
  U.sugar = c.sugar;
  U.tobacco = c.tobacco;
  U.cotton = c.cotton;
  U.cloth = even(U.cotton + t);
  U.horses = Math.trunc((tribe?.breeding ?? 0) / ((dwellings >> 1) + 1));

  D.tobacco = (6 - t) * P + 2 * c.cold + 5;
  D.cotton = U.cloth + c.heat;
  D.rum = 2 * (2 * (2 * t + P) + c.heat);
  D.cigars = 2 * (2 * P - t + 7);
  D.cloth = (t + P) * P + (c.heat >> 1) + c.cold;
  D.coats = 8 * c.cold + U.furs;
  D.tradeGoods = (t + 2) * (P + 3) + 8;
  D.tools = t === 0 ? 0 : Math.min(E.demandMax, t * P * 2 ** Math.min(10, (c.cold >> 1) + 1));
  D.muskets = 4 * (7 - (tribe?.muskets ?? 0) - t);
  D.horses = 4 * (9 - (tribe?.horses ?? 0) - t);
  for (const g of GOOD_IDS) D[g] = Math.min(E.demandMax, Math.max(0, D[g]));

  if (settlement.capital) {
    for (const g of CAPITAL_DEMAND_DOUBLE) D[g] *= 2;
    for (const g of CAPITAL_DEMAND_HALF_MORE) D[g] += D[g] >> 1;
    for (const g of CAPITAL_SUPPLY_DOUBLE) U[g] *= 2;
  }

  // what the tribe has been sold a lot of it wants less; what it has sold a lot of it has less to spare
  for (const g of GOOD_IDS) {
    const s = amountOf(tribe?.stock ?? {}, g);
    if (s > 0) D[g] += E.stockEffect * Math.trunc((-E.stockSlack - s) / E.stockStep);
    else if (s < 0) U[g] += E.stockEffect * Math.trunc((s + E.stockSlack) / E.stockStep);
  }

  // plenty lowers wanting, and wanting lowers what can be spared
  for (const g of GOOD_IDS) {
    const u = U[g];
    const d = D[g];
    U[g] = u > 0 ? Math.max(1, u - (d >> 1)) : 0;
    D[g] = d > 0 ? Math.max(1, d - (u >> 1)) : 0;
  }
  return { demand: D, supply: U };
}

/** The goods a settlement most wants, strongest first, leaving out what it last bought and last sold. */
export function wantedGoods(state: GameState, settlement: Settlement): GoodId[] {
  const { demand } = settlementEconomy(state, settlement);
  return GOOD_IDS.filter((g) => g !== settlement.lastBought && g !== settlement.lastSold && demand[g] > 0)
    .sort((a, b) => demand[b] - demand[a])
    .slice(0, E.wanted);
}

/** The good a settlement has most of to spare, with how plentiful it is. */
export function chiefProduct(state: GameState, settlement: Settlement): { good: GoodId; supply: number } | null {
  const { supply } = settlementEconomy(state, settlement);
  let best: GoodId | null = null;
  for (const g of GOOD_IDS) if (supply[g] > 0 && (best === null || supply[g] > supply[best])) best = g;
  return best ? { good: best, supply: supply[best] } : null;
}
