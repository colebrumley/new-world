// Everything the colony screen shows, worked out from the game state as plain data so it can
// be tested without a browser and rendered without further rule knowledge.
import { hasCustomHouse } from '../engine/custom-house';
import { holdsFree, holdsUsed } from '../engine/cargo';
import { availableItems, buyQuote, itemCost, itemName } from '../engine/construction';
import { BUILDING_CHAINS, BUILDINGS, chainLevel, type BuildingChain, type BuildingId } from '../engine/data/buildings';
import { GOOD_IDS, GOOD_NAMES, type GoodId } from '../engine/data/goods';
import type { NationId } from '../engine/data/nations';
import { TRADE_IDS, TRADES, type TradeId } from '../engine/data/production';
import { RAW_GOODS, type RawGood } from '../engine/data/terrain';
import { UNIT_TYPES } from '../engine/data/units';
import { colonyProduction, indoorOutput, tradeCapacity, workersIn, type AnyGood } from '../engine/economy';
import { centerOutput, fieldOutput, jobOptions, squareStatus, workerAt, type SquareStatus } from '../engine/jobs';
import { solPercent, solProductionTerm } from '../engine/liberty';
import { warehouseCapacity } from '../engine/pioneer';
import { hasFather, type BuildItem, type Colonist, type Colony, type GameState, type Unit } from '../engine/state';
import { PROFESSIONS } from '../engine/data/professions';
import { unitLabel } from './sidebar';

export interface PersonView {
  readonly id: string;
  readonly label: string;
  /** What they are doing, e.g. "5 Food" or "3 Cloth". */
  readonly doing: string;
}

export interface BuildingView {
  readonly chain: BuildingChain;
  readonly id: BuildingId;
  readonly name: string;
  /** Trade worked here, if any. */
  readonly trade: TradeId | null;
  readonly capacity: number;
  readonly workers: readonly PersonView[];
}

export interface SquareView {
  readonly dx: number;
  readonly dy: number;
  readonly status: SquareStatus | 'center';
  readonly worker: PersonView | null;
  /** For the colony square: what it yields by itself. */
  readonly note: string;
}

export interface CarrierView {
  readonly id: string;
  readonly label: string;
  readonly holds: number;
  readonly used: number;
  readonly cargo: readonly { readonly good: GoodId; readonly name: string; readonly amount: number }[];
  readonly passengers: readonly PersonView[];
}

export interface ProductionLine {
  readonly good: AnyGood;
  readonly name: string;
  readonly made: number;
  readonly used: number;
  readonly net: number;
}

export interface ColonyView {
  readonly id: string;
  readonly name: string;
  /** The player the colony belongs to, and the power they play, whose flag it flies. */
  readonly owner: string;
  readonly nation: NationId | null;
  readonly population: number;
  readonly solPercent: number;
  readonly toryPercent: number;
  readonly buildings: readonly BuildingView[];
  readonly squares: readonly SquareView[];
  readonly idle: readonly PersonView[];
  /** Units standing on the colony square, outside the colony and not aboard anything. */
  readonly outside: readonly PersonView[];
  readonly carriers: readonly CarrierView[];
  readonly warehouse: readonly { readonly good: GoodId; readonly name: string; readonly amount: number; readonly exported: boolean }[];
  /** Whether there is a Custom House to give export orders to. */
  readonly customHouse: boolean;
  readonly capacity: number;
  readonly food: { readonly made: number; readonly eaten: number; readonly surplus: number; readonly stored: number };
  readonly production: readonly ProductionLine[];
  readonly construction: {
    readonly item: string | null;
    readonly hammers: number;
    readonly hammersNeeded: number;
    readonly tools: number;
    readonly toolsNeeded: number;
    readonly buyPrice: number | null;
    readonly choices: readonly { readonly item: BuildItem; readonly label: string }[];
  };
}

const GOOD_LABEL: Readonly<Record<string, string>> = { ...GOOD_NAMES, fish: 'Fish' };
const profession = (c: Colonist): string => PROFESSIONS[c.profession].name;

function doing(state: GameState, colony: Colony, c: Colonist): string {
  if (c.job.kind === 'field') return `${fieldOutput(state, colony, c.profession, c.job.dx, c.job.dy, c.job.good)} ${GOOD_LABEL[c.job.good]}`;
  if (c.job.kind === 'work') {
    const def = TRADES[c.job.trade];
    if (!def.output) return def.name;
    const made = indoorOutput(c.job.trade, c.profession, {
      level: chainLevel(colony.buildings, def.chain), sol: solProductionTerm(state, colony), hasPenn: hasFather(state, colony.owner, 'williamPenn'),
    });
    return `${made} ${GOOD_LABEL[def.output]}`;
  }
  return 'Idle';
}

const person = (state: GameState, colony: Colony, c: Colonist): PersonView => ({ id: c.id, label: profession(c), doing: doing(state, colony, c) });
const unitPerson = (u: Unit): PersonView => ({ id: u.id, label: unitLabel(u), doing: u.type === 'pioneer' ? `${u.tools} Tools` : '' });

function tradeOf(chain: BuildingChain): TradeId | null {
  return TRADE_IDS.find((t) => TRADES[t].chain === chain) ?? null;
}

export function colonyView(state: GameState, colonyId: string): ColonyView | null {
  const colony = state.colonies[colonyId];
  if (!colony) return null;
  const report = colonyProduction(state, colony);
  const sol = solPercent(state, colony);

  const buildings: BuildingView[] = [];
  for (const chain of Object.keys(BUILDING_CHAINS) as BuildingChain[]) {
    const level = chainLevel(colony.buildings, chain);
    if (level === 0) continue;
    const id = BUILDING_CHAINS[chain][level - 1] as BuildingId;
    const trade = tradeOf(chain);
    buildings.push({
      chain, id, name: BUILDINGS[id].name, trade,
      capacity: trade ? tradeCapacity(colony, trade) : 0,
      workers: trade ? workersIn(colony, trade).map((c) => person(state, colony, c)) : [],
    });
  }

  const squares: SquareView[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) {
        const center = centerOutput(state, colony);
        const second = center.secondary ? `, ${center.secondary.amount} ${GOOD_LABEL[center.secondary.good]}` : '';
        squares.push({ dx, dy, status: 'center', worker: null, note: `${center.food} Food${second}` });
        continue;
      }
      const worker = workerAt(colony, dx, dy);
      squares.push({ dx, dy, status: squareStatus(state, colony, dx, dy), worker: worker ? person(state, colony, worker) : null, note: '' });
    }
  }

  const here = Object.values(state.units).filter((u) => u.x === colony.x && u.y === colony.y && u.owner === colony.owner && u.voyage === null);
  const carriers: CarrierView[] = here.filter((u) => UNIT_TYPES[u.type].holds > 0).map((u) => ({
    id: u.id,
    label: UNIT_TYPES[u.type].name,
    holds: UNIT_TYPES[u.type].holds,
    used: holdsUsed(state, u),
    cargo: GOOD_IDS.filter((g) => (u.cargo[g] ?? 0) > 0).map((g) => ({ good: g, name: GOOD_NAMES[g], amount: u.cargo[g] ?? 0 })),
    passengers: here.filter((p) => p.aboard === u.id).map(unitPerson),
  }));

  const lines: ProductionLine[] = [];
  for (const good of [...GOOD_IDS, 'hammers', 'crosses', 'bells'] as AnyGood[]) {
    const made = report.produced[good];
    const used = report.consumed[good];
    if (made === 0 && used === 0) continue;
    lines.push({ good, name: GOOD_LABEL[good] ?? good, made, used, net: made - used });
  }

  const cost = colony.construction ? itemCost(colony.construction) : { hammers: 0, tools: 0 };
  return {
    id: colony.id,
    name: colony.name,
    owner: colony.owner,
    nation: state.players.find((p) => p.id === colony.owner)?.nation ?? null,
    population: colony.colonists.length,
    solPercent: sol,
    toryPercent: 100 - sol,
    buildings,
    squares,
    idle: colony.colonists.filter((c) => c.job.kind === 'idle').map((c) => person(state, colony, c)),
    outside: here.filter((u) => UNIT_TYPES[u.type].holds === 0 && u.aboard === null).map(unitPerson),
    carriers,
    warehouse: GOOD_IDS.map((g) => ({ good: g, name: GOOD_NAMES[g], amount: colony.goods[g] ?? 0, exported: colony.exports.includes(g) })),
    customHouse: hasCustomHouse(colony),
    capacity: warehouseCapacity(colony),
    food: {
      made: report.produced.food, eaten: report.consumed.food,
      surplus: report.produced.food - report.consumed.food, stored: colony.goods.food ?? 0,
    },
    production: lines,
    construction: {
      item: colony.construction ? itemName(colony.construction) : null,
      hammers: colony.hammers,
      hammersNeeded: cost.hammers,
      tools: colony.goods.tools ?? 0,
      toolsNeeded: cost.tools,
      buyPrice: buyQuote(state, colony)?.price ?? null,
      choices: availableItems(state, colony).map((item) => ({ item, label: `${itemName(item)} (${itemCost(item).hammers} hammers${itemCost(item).tools ? `, ${itemCost(item).tools} tools` : ''})` })),
    },
  };
}

export interface JobChoice {
  readonly label: string;
  readonly job: Colonist['job'];
}

/** The jobs menu for a colonist: every outdoor good with "here / best elsewhere", then the indoor trades open to them. */
export function jobChoices(state: GameState, colonyId: string, colonistId: string): JobChoice[] {
  const colony = state.colonies[colonyId];
  const colonist = colony?.colonists.find((c) => c.id === colonistId);
  if (!colony || !colonist) return [];
  const choices: JobChoice[] = [];
  const names: Readonly<Record<RawGood, string>> = {
    food: 'Farmer', sugar: 'Sugar Planter', tobacco: 'Tobacco Planter', cotton: 'Cotton Planter', furs: 'Fur Trapper',
    lumber: 'Lumberjack', ore: 'Ore Miner', silver: 'Silver Miner', fish: 'Fisherman',
  };
  for (const option of jobOptions(state, colony, colonistId)) {
    if (!RAW_GOODS.includes(option.good) || !option.bestAt || option.best === 0) continue;
    const here = colonist.job.kind === 'field' ? colonist.job : null;
    // stay on the present square if it already offers this work, else go to the best one
    const stay = here !== null && option.here > 0;
    const at = stay && here ? { dx: here.dx, dy: here.dy } : option.bestAt;
    choices.push({ label: `${names[option.good]} (${option.here} here / ${option.best} best)`, job: { kind: 'field', dx: at.dx, dy: at.dy, good: option.good } });
  }
  for (const trade of TRADE_IDS) {
    const level = chainLevel(colony.buildings, TRADES[trade].chain);
    if (level === 0 || trade === 'teacher') continue;
    const already = colonist.job.kind === 'work' && colonist.job.trade === trade;
    if (!already && workersIn(colony, trade).length >= tradeCapacity(colony, trade)) continue;
    const made = indoorOutput(trade, colonist.profession, { level, sol: solProductionTerm(state, colony), hasPenn: hasFather(state, colony.owner, 'williamPenn') });
    const out = TRADES[trade].output;
    choices.push({ label: `${TRADES[trade].name} (${made} ${out ? GOOD_LABEL[out] : ''})`, job: { kind: 'work', trade } });
  }
  return choices;
}

/** Free holds on a carrier, for the screen's hints. */
export function carrierRoom(state: GameState, unit: Unit): number {
  return holdsFree(state, unit);
}
