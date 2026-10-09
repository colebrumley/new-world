// Pioneer work (R-204): clearing forest, plowing and road building, turn by turn.
import { addGoods, amountOf, spendTools } from './cargo';
import { PIONEER_WORK, WAREHOUSE } from './data/pioneer';
import { TERRAIN } from './data/terrain';
import { colonyAt, tileAt, tileIndex, type Colony, type ColonyId, type GameState, type Unit, type UnitId } from './state';
import { hasForest, isWater, terrainOf, type Tile } from './tile';

export type PioneerJob = 'plow' | 'road';

export type PioneerErrorCode = 'notPioneer' | 'alreadyPlowed' | 'alreadyRoad' | 'cannotImprove';

export type PioneerEvent =
  | { readonly type: 'tileImproved'; readonly x: number; readonly y: number; readonly improvement: 'cleared' | 'plowed' | 'road'; readonly unitId: UnitId }
  | { readonly type: 'lumberSalvaged'; readonly colonyId: ColonyId; readonly amount: number }
  | { readonly type: 'toolsUsedUp'; readonly unitId: UnitId };

export type PioneerCheck = { readonly ok: true } | { readonly ok: false; readonly code: PioneerErrorCode; readonly message: string };

const no = (code: PioneerErrorCode, message: string): PioneerCheck => ({ ok: false, code, message });

export function isHardy(unit: Unit): boolean {
  return unit.profession === 'hardyPioneer';
}

/** Turns a job takes on this tile, counting the turn the order is given. */
export function jobTurns(tile: Tile, job: PioneerJob, hardy: boolean): number {
  const base = TERRAIN[terrainOf(tile)].improve + (job === 'plow' ? PIONEER_WORK.plowExtraTurns : 0);
  return hardy ? Math.floor(base / PIONEER_WORK.hardyDivisor) : base;
}

/** May this job be started (or carried on) here? Says nothing about who is asking. */
export function checkJobSite(state: GameState, x: number, y: number, job: PioneerJob): PioneerCheck {
  const tile = tileAt(state.map, x, y);
  if (!tile || isWater(tile)) return no('cannotImprove', 'only land can be improved');
  if (job === 'road') {
    if (tile.road || colonyAt(state, x, y)) return no('alreadyRoad', 'this square already has a road');
    return { ok: true };
  }
  if (hasForest(tile)) return { ok: true }; // clearing
  if (tile.plowed) return no('alreadyPlowed', 'this land is already plowed');
  if ((PIONEER_WORK.noPlow as readonly string[]).includes(terrainOf(tile))) return no('cannotImprove', 'this ground cannot be plowed');
  return { ok: true };
}

export function checkPioneerOrder(state: GameState, unit: Unit, job: PioneerJob): PioneerCheck {
  if (unit.type !== 'pioneer' || unit.aboard !== null) return no('notPioneer', 'only pioneers with tools can do that');
  return checkJobSite(state, unit.x, unit.y, job);
}

export function warehouseCapacity(colony: Colony): number {
  return WAREHOUSE.base + WAREHOUSE.step * WAREHOUSE.buildings.filter((b) => colony.buildings.includes(b)).length;
}

/** Distance used to find the colony that gets the lumber: the longer leg plus half the shorter. */
function salvageDistance(colony: Colony, x: number, y: number): number {
  const dx = Math.abs(colony.x - x);
  const dy = Math.abs(colony.y - y);
  return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
}

/** Lumber a colony gains when a forest of this kind is cleared nearby, before the warehouse cap. */
export function salvagedLumber(forest: Tile, colony: Colony, hardy: boolean): number {
  const mill = colony.buildings.includes(PIONEER_WORK.lumberMill);
  const lots = mill ? TERRAIN[terrainOf(forest)].yields.lumber + 1 : 1;
  return lots * PIONEER_WORK.lumberLot * (hardy ? PIONEER_WORK.hardyLumberMultiplier : 1);
}

function finishJob(state: GameState, unit: Unit, job: PioneerJob, events: PioneerEvent[]): GameState {
  const { map } = state;
  const i = tileIndex(map, unit.x, unit.y);
  const tile = map.tiles[i] as Tile;
  const tiles = [...map.tiles];
  let next = state;
  if (job === 'road') {
    tiles[i] = { ...tile, road: true };
    events.push({ type: 'tileImproved', x: unit.x, y: unit.y, improvement: 'road', unitId: unit.id });
  } else if (hasForest(tile)) {
    tiles[i] = { ...tile, forest: false };
    events.push({ type: 'tileImproved', x: unit.x, y: unit.y, improvement: 'cleared', unitId: unit.id });
    // The timber goes to the nearest of the owner's colonies in range (the later one on a tie).
    let nearest: Colony | null = null;
    for (const colony of Object.values(state.colonies)) {
      if (colony.owner !== unit.owner || salvageDistance(colony, unit.x, unit.y) > PIONEER_WORK.lumberRange) continue;
      if (!nearest || salvageDistance(colony, unit.x, unit.y) <= salvageDistance(nearest, unit.x, unit.y)) nearest = colony;
    }
    if (nearest) {
      const room = Math.max(0, warehouseCapacity(nearest) - amountOf(nearest.goods, 'lumber'));
      const amount = Math.min(salvagedLumber(tile, nearest, isHardy(unit)), room);
      if (amount > 0) {
        next = { ...next, colonies: { ...next.colonies, [nearest.id]: { ...nearest, goods: addGoods(nearest.goods, 'lumber', amount) } } };
        events.push({ type: 'lumberSalvaged', colonyId: nearest.id, amount });
      }
    }
  } else {
    tiles[i] = { ...tile, plowed: true };
    events.push({ type: 'tileImproved', x: unit.x, y: unit.y, improvement: 'plowed', unitId: unit.id });
  }
  const spent = spendTools(unit);
  if (spent.reverted) events.push({ type: 'toolsUsedUp', unitId: unit.id });
  const done: Unit = { ...spent.unit, orders: 'none', workTurns: 0, movesLeft: 0 };
  return { ...next, map: { ...map, tiles }, units: { ...next.units, [done.id]: done } };
}

/**
 * One turn of work for a unit whose orders are a pioneer job. The turn the order is given
 * counts, so this is called at once when ordering and then at each of the owner's turn starts.
 */
export function workJob(state: GameState, unitId: UnitId, events: PioneerEvent[]): GameState {
  const unit = state.units[unitId];
  if (!unit || (unit.orders !== 'plow' && unit.orders !== 'road')) return state;
  const job: PioneerJob = unit.orders;
  // someone else finished it, or the tools are gone: stand down
  if (!checkPioneerOrder(state, unit, job).ok) {
    return { ...state, units: { ...state.units, [unit.id]: { ...unit, orders: 'none', workTurns: 0 } } };
  }
  const tile = tileAt(state.map, unit.x, unit.y) as Tile;
  const worked = unit.workTurns + 1;
  if (worked >= jobTurns(tile, job, isHardy(unit))) return finishJob(state, unit, job, events);
  return { ...state, units: { ...state.units, [unit.id]: { ...unit, workTurns: worked, movesLeft: 0 } } };
}
