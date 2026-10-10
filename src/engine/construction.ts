// What a colony may build, and building it (R-303).
import { addGoods, amountOf } from './cargo';
import { NEIGHBORS, coloniesOf } from './colony';
import { BUILDING_CHAINS, BUILDING_IDS, BUILDINGS, type BuildingId } from './data/buildings';
import { BUILDABLE_UNITS, CONSTRUCTION, type BuildableUnit } from './data/construction';
import { UNIT_TYPES } from './data/units';
import { askPrice } from './market';
import { fullMoves, isInlandLake } from './movement';
import { hasFather, tileAt, type BuildItem, type Colony, type ColonyId, type GameState, type Unit, type UnitId } from './state';
import { isWater } from './tile';

export type ConstructionErrorCode = 'notAvailable' | 'nothingToBuy' | 'cannotAfford' | 'noColonyHere';
export type ConstructionCheck = { readonly ok: true } | { readonly ok: false; readonly code: ConstructionErrorCode; readonly message: string };

export type ConstructionEvent =
  | { readonly type: 'buildingCompleted'; readonly colonyId: ColonyId; readonly building: BuildingId; readonly tools: number }
  | { readonly type: 'unitBuilt'; readonly colonyId: ColonyId; readonly unitId: UnitId; readonly unitType: BuildableUnit; readonly tools: number }
  | { readonly type: 'needTools'; readonly colonyId: ColonyId; readonly item: BuildItem; readonly missing: number }
  | { readonly type: 'alreadyHave'; readonly colonyId: ColonyId; readonly building: BuildingId }
  | { readonly type: 'noMoreWagons'; readonly colonyId: ColonyId }
  | { readonly type: 'constructionBought'; readonly colonyId: ColonyId; readonly price: number; readonly tools: number };

export function itemCost(item: BuildItem): { hammers: number; tools: number } {
  if (item.kind === 'building') return { hammers: BUILDINGS[item.id].hammers, tools: BUILDINGS[item.id].tools };
  return UNIT_TYPES[item.unit].build ?? { hammers: 0, tools: 0 };
}

export function itemName(item: BuildItem): string {
  return item.kind === 'building' ? BUILDINGS[item.id].name : UNIT_TYPES[item.unit].name;
}

export const sameItem = (a: BuildItem | null, b: BuildItem | null): boolean =>
  a !== null && b !== null && a.kind === b.kind && (a.kind === 'building' ? a.id === (b as { id: string }).id : a.unit === (b as { unit: string }).unit);

/** Does any of the eight squares round the colony hold water? (Docks) */
export function hasWaterSquare(state: GameState, colony: Colony): boolean {
  return NEIGHBORS.some(([dx, dy]) => {
    const tile = tileAt(state.map, colony.x + dx, colony.y + dy);
    return tile !== null && isWater(tile);
  });
}

/** A port colony borders water that belongs to the open sea. (Drydock, Shipyard, ships) */
export function isPortColony(state: GameState, colony: { readonly x: number; readonly y: number }): boolean {
  return NEIGHBORS.some(([dx, dy]) => {
    const x = colony.x + dx;
    const y = colony.y + dy;
    const tile = tileAt(state.map, x, y);
    return tile !== null && isWater(tile) && !isInlandLake(state.map, x, y);
  });
}

function buildingAvailable(state: GameState, colony: Colony, id: BuildingId): boolean {
  const def = BUILDINGS[id];
  if (def.unused || def.chain === null || colony.buildings.includes(id)) return false;
  if (colony.colonists.length < def.minPopulation) return false;
  const chain: readonly BuildingId[] = BUILDING_CHAINS[def.chain];
  const previous = chain[def.level - 2];
  if (previous && !colony.buildings.includes(previous)) return false;
  if (def.needsFather && !hasFather(state, colony.owner, def.needsFather)) return false;
  if (id === 'docks') return hasWaterSquare(state, colony);
  if (def.coastal) return isPortColony(state, colony);
  return true;
}

function wagonsOf(state: GameState, owner: string): number {
  return Object.values(state.units).filter((u) => u.owner === owner && u.type === 'wagonTrain').length;
}

function unitAvailable(state: GameState, colony: Colony, unit: BuildableUnit): boolean {
  const needs = BUILDABLE_UNITS[unit];
  if (needs && !colony.buildings.includes(needs)) return false;
  if (unit === 'wagonTrain') return wagonsOf(state, colony.owner) < coloniesOf(state, colony.owner).length;
  return true;
}

/** Everything the colony could start on now. The project already under way is always listed. */
export function availableItems(state: GameState, colony: Colony): BuildItem[] {
  const items: BuildItem[] = [];
  for (const id of BUILDING_IDS) if (buildingAvailable(state, colony, id)) items.push({ kind: 'building', id });
  for (const unit of Object.keys(BUILDABLE_UNITS) as BuildableUnit[]) if (unitAvailable(state, colony, unit)) items.push({ kind: 'unit', unit });
  if (colony.construction && !items.some((i) => sameItem(i, colony.construction))) items.push(colony.construction);
  return items;
}

export function checkSetConstruction(state: GameState, colony: Colony | undefined, item: BuildItem | null): ConstructionCheck {
  if (!colony) return { ok: false, code: 'noColonyHere', message: 'no such colony' };
  if (item === null) return { ok: true };
  if (!availableItems(state, colony).some((i) => sameItem(i, item))) return { ok: false, code: 'notAvailable', message: 'this colony cannot build that now' };
  return { ok: true };
}

/** What a new colony starts on: Docks if it is a port, otherwise a Warehouse. */
export function firstProject(state: GameState, site: { readonly x: number; readonly y: number }): BuildItem {
  return { kind: 'building', id: isPortColony(state, site) ? CONSTRUCTION.firstProjectPort : CONSTRUCTION.firstProject };
}

/** Market price of one tool for this power, used when buying a project: what Europe asks. */
export function toolsPrice(state: GameState, owner: string): number {
  return askPrice(state, owner, 'tools');
}

export interface BuyQuote {
  readonly hammersLeft: number;
  readonly toolsLeft: number;
  readonly price: number;
}

/** What it costs to finish the current project now, or null when there is nothing to pay for. */
export function buyQuote(state: GameState, colony: Colony): BuyQuote | null {
  if (!colony.construction) return null;
  if (colony.construction.kind === 'building' && colony.buildings.includes(colony.construction.id)) return null;
  const cost = itemCost(colony.construction);
  const hammersLeft = Math.max(0, cost.hammers - colony.hammers);
  const toolsLeft = Math.max(0, cost.tools - amountOf(colony.goods, 'tools'));
  if (hammersLeft === 0 && toolsLeft === 0) return null;
  let price = hammersLeft * CONSTRUCTION.goldPerHammer + toolsLeft * (toolsPrice(state, colony.owner) + CONSTRUCTION.toolSurcharge);
  if (colony.hammers === 0) price *= CONSTRUCTION.noProgressMultiplier;
  return { hammersLeft, toolsLeft, price };
}

export function checkBuy(state: GameState, colony: Colony | undefined): ConstructionCheck {
  if (!colony) return { ok: false, code: 'noColonyHere', message: 'no such colony' };
  const quote = buyQuote(state, colony);
  if (!quote) return { ok: false, code: 'nothingToBuy', message: 'there is nothing left to pay for' };
  const gold = state.players.find((p) => p.id === colony.owner)?.gold ?? 0;
  if (gold < quote.price) return { ok: false, code: 'cannotAfford', message: `that would cost ${quote.price} gold` };
  return { ok: true };
}

/** Pay to finish the project: the hammer store is topped up and missing tools are bought in. It is completed at the end of the turn as usual. */
export function buyConstruction(state: GameState, colony: Colony, events: ConstructionEvent[]): GameState {
  const quote = buyQuote(state, colony) as BuyQuote;
  const cost = itemCost(colony.construction as BuildItem);
  const bought: Colony = {
    ...colony,
    hammers: Math.max(colony.hammers, cost.hammers),
    goods: quote.toolsLeft > 0 ? addGoods(colony.goods, 'tools', quote.toolsLeft) : colony.goods,
  };
  events.push({ type: 'constructionBought', colonyId: colony.id, price: quote.price, tools: quote.toolsLeft });
  return {
    ...state,
    players: state.players.map((p) => (p.id === colony.owner ? { ...p, gold: p.gold - quote.price } : p)),
    colonies: { ...state.colonies, [colony.id]: bought },
  };
}

/**
 * The end-of-turn construction test for one colony, run after its stores are updated: with
 * enough hammers and tools the project is finished, the tools are used and the hammer store is
 * emptied (nothing carries over). The project stays selected afterwards.
 */
export function completeConstruction(state: GameState, colonyId: ColonyId, events: ConstructionEvent[]): GameState {
  const colony = state.colonies[colonyId];
  if (!colony || !colony.construction) return state;
  const item = colony.construction;
  const cost = itemCost(item);
  if (colony.hammers < cost.hammers) return state;
  if (item.kind === 'building' && colony.buildings.includes(item.id)) {
    events.push({ type: 'alreadyHave', colonyId, building: item.id });
    return state;
  }
  if (item.kind === 'unit' && item.unit === 'wagonTrain' && wagonsOf(state, colony.owner) >= coloniesOf(state, colony.owner).length) {
    events.push({ type: 'noMoreWagons', colonyId });
    return state;
  }
  let goods = colony.goods;
  const have = amountOf(goods, 'tools');
  if (have < cost.tools) {
    const ai = state.players.find((p) => p.id === colony.owner)?.kind === 'ai';
    if (!ai) {
      events.push({ type: 'needTools', colonyId, item, missing: cost.tools - have });
      return state;
    }
    goods = addGoods(goods, 'tools', cost.tools - have); // AI colonies are simply given the tools
  }
  if (cost.tools > 0) goods = addGoods(goods, 'tools', -cost.tools);
  const spent = Math.min(have, cost.tools);
  if (item.kind === 'building') {
    events.push({ type: 'buildingCompleted', colonyId, building: item.id, tools: spent });
    const built: Colony = { ...colony, goods, hammers: 0, buildings: [...colony.buildings, item.id] };
    return { ...state, colonies: { ...state.colonies, [colonyId]: built } };
  }
  const id: UnitId = `u${state.nextId}`;
  const shell: Unit = {
    id, owner: colony.owner, type: item.unit, profession: null, x: colony.x, y: colony.y, movesLeft: 0, orders: 'none',
    destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
  };
  events.push({ type: 'unitBuilt', colonyId, unitId: id, unitType: item.unit, tools: spent });
  // a gun built in a computer power's colony earns it one in Europe as well
  const credited = item.unit === 'artillery' && state.players.find((p) => p.id === colony.owner)?.kind === 'ai';
  return {
    ...state,
    players: credited ? state.players.map((p) => (p.id === colony.owner ? { ...p, gunCredit: (p.gunCredit ?? 0) + 1 } : p)) : state.players,
    nextId: state.nextId + 1,
    units: { ...state.units, [id]: { ...shell, movesLeft: fullMoves(shell) } },
    colonies: { ...state.colonies, [colonyId]: { ...colony, goods, hammers: 0 } },
  };
}
