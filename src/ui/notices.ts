// What the colonies report as a turn opens (R-1001): one line for each event the player has
// asked to hear about, and lines for foreign and native units seen to move.
import type { GameEvent } from '../engine/actions';
import { BUILDINGS } from '../engine/data/buildings';
import { GOOD_NAMES, type GoodId } from '../engine/data/goods';
import { NATIONS } from '../engine/data/nations';
import { PROFESSIONS } from '../engine/data/professions';
import { TRIBES } from '../engine/data/tribes';
import { UNIT_TYPES } from '../engine/data/units';
import { tribeOfOwner } from '../engine/settlements';
import type { GameState, PlayerId } from '../engine/state';
import { isExploredBy } from '../engine/tile';
import type { Options } from './options';

const goodName = (good: GoodId): string => ((GOOD_NAMES as Readonly<Record<string, string>>)[good] ?? good).toLowerCase();

/** The lines to log for these events, as this player wants them reported. `state` is the state after them. */
export function colonyNotices(events: readonly GameEvent[], state: GameState, playerId: PlayerId, options: Options): string[] {
  const out: string[] = [];
  const mine = (colonyId: string): string | null => {
    const colony = state.colonies[colonyId];
    return colony && colony.owner === playerId ? colony.name : null;
  };
  for (const e of events) {
    switch (e.type) {
      case 'colonistTaught': {
        const name = mine(e.colonyId);
        if (name && options.reportTrained) out.push(`${name}: a colonist has been taught and is now ${article(PROFESSIONS[e.to].name)}.`);
        break;
      }
      case 'learnedByDoing': {
        const name = mine(e.colonyId);
        if (name && options.reportTrained) out.push(`${name}: a colonist has learned by experience and is now ${article(PROFESSIONS[e.to].name)}.`);
        break;
      }
      case 'foodLow': {
        const name = mine(e.colonyId);
        if (name && options.reportFood) out.push(`${name}: food will run out in ${e.turnsLeft} turn${e.turnsLeft === 1 ? '' : 's'}.`);
        break;
      }
      case 'foodDepleted': {
        const name = mine(e.colonyId);
        if (name && options.reportFood) out.push(`${name}: the last of the food is eaten. Someone will starve next turn.`);
        break;
      }
      case 'colonistStarved': {
        const name = mine(e.colonyId);
        if (name) out.push(`${name}: a colonist has starved.`); // never silenced
        break;
      }
      case 'ranOutOf': {
        const name = mine(e.colonyId);
        if (name && options.reportRawMaterials) out.push(`${name}: work has stopped for want of ${goodName(e.good)}.`);
        break;
      }
      case 'needTools': {
        const name = mine(e.colonyId);
        const item = e.item.kind === 'unit' ? UNIT_TYPES[e.item.unit].name : BUILDINGS[e.item.id].name;
        if (name && options.reportTools) out.push(`${name}: the ${item} needs ${e.missing} more tools.`);
        break;
      }
      case 'toriesObstruct': {
        const name = mine(e.colonyId);
        if (name && options.reportInefficient) out.push(`${name}: Tory feeling is slowing every worker in the colony.`);
        break;
      }
      case 'toriesSubside': {
        const name = mine(e.colonyId);
        if (name && options.reportInefficient) out.push(`${name}: the Tories no longer hold the colony back.`);
        break;
      }
      case 'warehouseFull': {
        const name = mine(e.colonyId);
        if (name && options.reportNewCargo) out.push(`${name}: the warehouse cannot hold all the ${goodName(e.good)} (${e.amount} of ${e.capacity}).`);
        break;
      }
      case 'membershipChanged': {
        const name = mine(e.colonyId);
        if (name && options.reportSonsOfLiberty) out.push(`${name}: Sons of Liberty membership has ${e.rising ? 'risen' : 'fallen'} to ${e.percent}%.`);
        break;
      }
      case 'rebelMajority':
      case 'rebelUnanimous': {
        const name = mine(e.colonyId);
        if (name && options.reportRebelMajority) out.push(`${name}: ${e.type === 'rebelMajority' ? 'half the colony now stands' : 'the whole colony now stands'} with the Sons of Liberty (${e.percent}%). Production rises.`);
        break;
      }
      case 'toryMajority':
      case 'toryMinority': {
        const name = mine(e.colonyId);
        if (name && options.reportRebelMajority) out.push(`${name}: Sons of Liberty membership has slipped to ${e.percent}% and a production bonus is lost.`);
        break;
      }
      case 'buildingCompleted': {
        const name = mine(e.colonyId);
        if (name) out.push(`${name} has completed its ${BUILDINGS[e.building].name}.`);
        break;
      }
      case 'unitBuilt': {
        const name = mine(e.colonyId);
        if (name) out.push(`${name} has built ${article(UNIT_TYPES[e.unitType].name)}.`);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

const article = (name: string): string => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;

/** New cargo: goods a colony has a full load of now and did not before. */
export function cargoNotices(before: GameState, after: GameState, playerId: PlayerId, options: Options, load = 100): string[] {
  if (!options.reportNewCargo) return [];
  const out: string[] = [];
  for (const colony of Object.values(after.colonies)) {
    if (colony.owner !== playerId) continue;
    const was = before.colonies[colony.id]?.goods ?? {};
    for (const [good, amount] of Object.entries(colony.goods) as [GoodId, number][]) {
      if (good === 'food' || amount < load || (was[good] ?? 0) >= load) continue;
      out.push(`${colony.name}: ${amount} ${goodName(good)} is ready to be shipped.`);
    }
  }
  return out;
}

/** Units of others that moved, or appeared, where this player can see: at most `most` lines and a count of the rest. */
export function movementNotices(before: GameState, after: GameState, playerId: PlayerId, options: Options, most = 3): string[] {
  const index = after.players.findIndex((p) => p.id === playerId);
  const near = (x: number, y: number): boolean =>
    Object.values(after.units).some((u) => u.owner === playerId && u.voyage === null && Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) <= 2)
    || Object.values(after.colonies).some((c) => c.owner === playerId && Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= 2);
  const lines: string[] = [];
  for (const unit of Object.values(after.units)) {
    if (unit.owner === playerId || unit.voyage !== null || unit.aboard !== null) continue;
    const tribe = tribeOfOwner(unit.owner);
    if (tribe ? !options.showIndianMoves : !options.showForeignMoves) continue;
    const was = before.units[unit.id];
    if (was && was.x === unit.x && was.y === unit.y) continue;
    const tile = after.map.tiles[unit.y * after.map.width + unit.x];
    if (!tile || !isExploredBy(tile, index) || !near(unit.x, unit.y)) continue;
    const owner = after.players.find((p) => p.id === unit.owner);
    const whose = tribe ? TRIBES[tribe].adjective : unit.owner === after.crownPlayer ? 'Royal' : owner ? NATIONS[owner.nation].adjective : 'Foreign';
    // native bands are named in the plural in the unit table
    if (tribe) lines.push(`${whose} ${UNIT_TYPES[unit.type].name.toLowerCase()} ${was ? 'have moved to' : 'have appeared at'} (${unit.x}, ${unit.y}).`);
    else lines.push(`${article(`${whose} ${UNIT_TYPES[unit.type].name}`)} ${was ? 'has moved to' : 'has appeared at'} (${unit.x}, ${unit.y}).`.replace(/^a/, 'A'));
  }
  return lines.length <= most ? lines : [...lines.slice(0, most), `${lines.length - most} more foreign or native units were seen on the move.`];
}

/** A line for each ship of this player's that made port in Europe (R-1022). Always logged; no option governs it. */
export function voyageNotices(events: readonly GameEvent[], state: GameState, playerId: PlayerId): string[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const out: string[] = [];
  for (const e of events) {
    if (e.type !== 'shipReachedEurope') continue;
    const ship = state.units[e.unitId];
    if (!ship || ship.owner !== playerId) continue;
    out.push(`Our ${UNIT_TYPES[ship.type].name} has reached ${NATIONS[player.nation].homePort} and awaits orders.`);
  }
  return out;
}
