// What a map square is, in words: the pure model behind the map's hover slip and the sidebar's
// list of ground features, the units the map shows standing on it, and where the slip goes beside the
// pointer. Nothing here touches the DOM.
import { holdsUsed } from '../engine/cargo';
import { GOOD_NAMES } from '../engine/data/goods';
import { NATIONS } from '../engine/data/nations';
import { RESOURCE_BONUS, RESOURCES, type ResourceBonus, type ResourceId } from '../engine/data/resources';
import { defensePercent, RAW_GOODS, TERRAIN, type RawGood } from '../engine/data/terrain';
import { TRIBES } from '../engine/data/tribes';
import { UNIT_TYPES } from '../engine/data/units';
import { visibleUnits } from '../engine/explore';
import { tribeOfOwner } from '../engine/settlements';
import { tileAt, type GameState, type Unit, type UnitId } from '../engine/state';
import { isExploredBy, terrainOf, type Tile } from '../engine/tile';
import { countWaterNeighbors, FREE_COLONIST, tileYield } from '../engine/yields';
import { viewerIndex } from './render';
import { topUnit } from './unit-queue';
import { formatMoves, manifest, ORDER_NAMES, unitLabel } from './unit-text';

export interface UnitTip {
  /** "Veteran Soldier · Moves 1 · Fortified" / "French Caravel · 2 holds in use" / "and others". */
  readonly line: string;
  /** "Carrying Free Colonist, 100 Muskets"; '' for a unit that carries nothing, and for every unit of another power. */
  readonly carried: string;
}

export interface TileTip {
  /** The terrain's name: "Grassland", "Conifer Forest", "Hills", "Ocean". */
  readonly title: string;
  /** One line per feature, in this order: resource, river, road, plowed, rumor. */
  readonly features: readonly string[];
  /** "3 Food, 3 Tobacco": what a free colonist brings in, in RAW_GOODS order, zeros left out; '' if nothing. */
  readonly yields: string;
  /** "Move 1 · Defence none" / "Move 2 · Defence +50%". */
  readonly ground: string;
  /** The units the map shows on the square, top of the stack first; empty where it shows none. */
  readonly units: readonly UnitTip[];
}

/** How long the pointer rests on a square before the map's slip appears, in milliseconds. */
export const TOOLTIP_DELAY_MS = 400;
/** How far the slip stands from the pointer, in pixels, across and down. */
export const TOOLTIP_GAP = 14;
/** How many units the slip names before it says only how many more there are, so a great stack cannot outgrow the map. */
export const TOOLTIP_UNIT_LIMIT = 8;

/** The entries the slip has room for: all of them up to the limit, otherwise the first of them and "and 4 more". */
export function slipUnits(units: readonly UnitTip[], limit: number = TOOLTIP_UNIT_LIMIT): readonly UnitTip[] {
  if (units.length <= limit) return units;
  return [...units.slice(0, limit - 1), { line: `and ${units.length - (limit - 1)} more`, carried: '' }];
}

/**
 * The slip's top-left corner in canvas pixels: right of and below the pointer, to its left where it
 * would run over the right edge, above it where it would run over the bottom, and kept on the canvas.
 */
export function placeTooltip(
  pointer: { readonly x: number; readonly y: number },
  slip: { readonly width: number; readonly height: number },
  canvas: { readonly width: number; readonly height: number },
): { x: number; y: number } {
  let x = pointer.x + TOOLTIP_GAP;
  if (x + slip.width > canvas.width) x = pointer.x - TOOLTIP_GAP - slip.width;
  let y = pointer.y + TOOLTIP_GAP;
  if (y + slip.height > canvas.height) y = pointer.y - TOOLTIP_GAP - slip.height;
  return {
    x: Math.max(0, Math.min(x, canvas.width - slip.width)),
    y: Math.max(0, Math.min(y, canvas.height - slip.height)),
  };
}

/** Fish is a raw good but not a cargo, so it has no entry among the goods' names. */
function rawGoodName(good: RawGood): string {
  return good === 'fish' ? 'Fish' : GOOD_NAMES[good];
}

/** "+2 Food", "+3 Ore, +1 Silver", "doubles Cotton", "nothing left to dig": read from RESOURCE_BONUS. */
function resourceEffect(resource: ResourceId): string {
  const table: Partial<Record<RawGood, ResourceBonus>> = RESOURCE_BONUS[resource];
  const parts = RAW_GOODS.flatMap((good) => {
    const bonus = table[good];
    if (!bonus) return [];
    return [bonus.kind === 'double' ? `doubles ${rawGoodName(good)}` : `+${bonus.n} ${rawGoodName(good)}`];
  });
  return parts.length > 0 ? parts.join(', ') : 'nothing left to dig';
}

const RIVER_NAMES = { minor: 'Minor River', major: 'Major River' } as const;

/** River, road and plowed lines, in that order. */
function improvements(tile: Tile): string[] {
  const lines: string[] = [];
  if (tile.river !== 'none') lines.push(RIVER_NAMES[tile.river]);
  if (tile.road) lines.push('Road');
  if (tile.plowed) lines.push('Plowed');
  return lines;
}

/** The feature names the sidebar lists: river, road, plowed, resource, rumor, in the sidebar's order. */
export function groundFeatures(tile: Tile): string[] {
  const lines = improvements(tile);
  if (tile.resource) lines.push(RESOURCES[tile.resource].name);
  if (tile.rumor) lines.push('Lost City Rumor');
  return lines;
}

/** One of the viewer's own units, as the sidebar describes it, with a treasure train's gold. */
function ownUnitTip(state: GameState, unit: Unit): UnitTip {
  const load = manifest(state, unit);
  if (unit.treasure > 0) load.push(`${unit.treasure} gold`);
  return {
    line: `${unitLabel(unit)} · Moves ${formatMoves(unit.movesLeft)} · ${ORDER_NAMES[unit.orders]}`,
    carried: load.length > 0 ? `Carrying ${load.join(', ')}` : '',
  };
}

/** Whose the Crown's units are said to be; left off a kind whose name already says so. */
const CROWN_ADJECTIVE = 'Royal';
const CROWN_PREFIX = "King's";

/** "French", "Sioux", "Royal" for the Crown's army; '' for an owner the game does not know. */
function ownerAdjective(state: GameState, owner: string): string {
  if (owner === state.crownPlayer) return CROWN_ADJECTIVE;
  const tribe = tribeOfOwner(owner);
  if (tribe) return TRIBES[tribe].adjective;
  const player = state.players.find((p) => p.id === owner);
  return player ? NATIONS[player.nation].adjective : '';
}

/** Another power's unit: whose it is and its kind, never its skill; a ship adds the holds in use that her piece shows. */
function foreignUnitTip(state: GameState, unit: Unit): UnitTip {
  const type = UNIT_TYPES[unit.type];
  const adjective = ownerAdjective(state, unit.owner);
  const name = adjective && !(adjective === CROWN_ADJECTIVE && type.name.startsWith(CROWN_PREFIX)) ? `${adjective} ${type.name}` : type.name;
  if (type.domain !== 'sea') return { line: name, carried: '' };
  const holds = holdsUsed(state, unit);
  return { line: `${name} · ${holds === 0 ? 'holds empty' : `${holds} ${holds === 1 ? 'hold' : 'holds'} in use`}`, carried: '' };
}

/** The units the map draws at (x, y), in words: what `renderPieces` in render.ts shows there. */
function unitTips(state: GameState, x: number, y: number, revealAll: boolean, activeUnitId: UnitId | null): UnitTip[] {
  const viewer = viewerIndex(state);
  const me = state.players[viewer]?.id;
  const stack = (revealAll ? Object.values(state.units) : visibleUnits(state, viewer)).filter((u) => u.x === x && u.y === y && u.aboard === null && u.voyage === null);
  const top = topUnit(stack, activeUnitId);
  if (!top) return [];
  const describe = (unit: Unit): UnitTip => (unit.owner === me ? ownUnitTip(state, unit) : foreignUnitTip(state, unit));
  // inside a colony the map draws the active piece only
  if (Object.values(state.colonies).some((c) => c.x === x && c.y === y)) return top.id === activeUnitId ? [describe(top)] : [];
  if (top.owner === me) return [top, ...stack.filter((u) => u.owner === me && u.id !== top.id)].map(describe);
  return stack.length > 1 ? [describe(top), { line: 'and others', carried: '' }] : [describe(top)];
}

/** Null off the map and for a square the viewer has not explored (unless revealAll). */
export function tileTip(state: GameState, x: number, y: number, revealAll = false, activeUnitId: UnitId | null = null): TileTip | null {
  const tile = tileAt(state.map, x, y);
  if (!tile) return null;
  if (!revealAll && !isExploredBy(tile, viewerIndex(state))) return null;
  const terrain = terrainOf(tile);
  const features: string[] = [];
  if (tile.resource) features.push(`${RESOURCES[tile.resource].name}: ${resourceEffect(tile.resource)}`);
  features.push(...improvements(tile));
  if (tile.rumor) features.push('Lost City Rumor');
  // the square's own water neighbours, otherwise the neutral context (Docks assumed for fish)
  const context = { waterNeighbors: countWaterNeighbors(state.map, x, y) };
  const yields = RAW_GOODS.flatMap((good) => {
    const amount = tileYield(tile, good, FREE_COLONIST, context);
    return amount > 0 ? [`${amount} ${rawGoodName(good)}`] : [];
  }).join(', ');
  const defence = defensePercent(terrain);
  return {
    title: TERRAIN[terrain].name,
    features,
    yields,
    ground: `Move ${TERRAIN[terrain].moveCost} · Defence ${defence === 0 ? 'none' : `+${defence}%`}`,
    units: unitTips(state, x, y, revealAll, activeUnitId),
  };
}
